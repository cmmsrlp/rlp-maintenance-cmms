import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ForbiddenError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { gerarInsightsDeClientes, type DadosClienteParaInsight } from "../../lib/ai";

export const listInsights = asyncHandler(async (_req: Request, res: Response) => {
  const insights = await prisma.clientInsight.findMany({
    orderBy: { generatedAt: "desc" },
    include: { client: { select: { id: true, companyName: true, tradeName: true } } },
  });
  res.json(insights);
});

const ORDENS_ABERTAS = [
  "OPEN",
  "IN_TRIAGE",
  "PLANNED",
  "PROGRAMMED",
  "RELEASED",
  "IN_PROGRESS",
  "AWAITING_MATERIAL",
  "AWAITING_RELEASE",
  "AWAITING_STOPPAGE",
] as const;

/** Numeros reais do CMMS que alimentam o prompt da IA - os mesmos para o lote (equipe RLP)
 * e para a geracao individual (autoatendimento do cliente no portal). */
async function coletarDadosParaInsight(clients: { id: string; companyName: string; tradeName: string | null; plan: { maxUsers: number | null; maxInstruments: number | null } | null }[]): Promise<DadosClienteParaInsight[]> {
  const now = new Date();
  return Promise.all(
    clients.map(async (c) => {
      const [planosAtrasados, ordensAbertas, pecasEmFalta, users, instruments] = await Promise.all([
        prisma.maintenancePlan.count({ where: { clientId: c.id, deletedAt: null, active: true, nextDueDate: { lt: now } } }),
        prisma.maintenanceWorkOrder.count({ where: { clientId: c.id, deletedAt: null, status: { in: [...ORDENS_ABERTAS] } } }),
        prisma.sparePart
          .findMany({ where: { clientId: c.id, deletedAt: null, active: true }, select: { stockQty: true, minStock: true } })
          .then((pecas) => pecas.filter((p) => p.stockQty <= p.minStock).length),
        prisma.user.count({ where: { clientId: c.id, deletedAt: null } }),
        prisma.instrument.count({ where: { clientId: c.id, deletedAt: null } }),
      ]);

      const pct = (current: number, limit: number | null | undefined) => (limit == null ? null : Math.round((current / limit) * 100));

      return {
        clientId: c.id,
        nome: c.tradeName || c.companyName,
        planosAtrasados,
        ordensAbertas,
        pecasEmFalta,
        usoUsuariosPct: pct(users, c.plan?.maxUsers),
        usoAtivosPct: pct(instruments, c.plan?.maxInstruments),
      };
    }),
  );
}

async function gerarESalvar(dados: DadosClienteParaInsight[]) {
  let gerados;
  try {
    gerados = await gerarInsightsDeClientes(dados);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Falha ao gerar insights.");
  }

  if (gerados.length === 0) {
    throw new ValidationError("IA nao configurada ou nao retornou sugestoes (verifique GEMINI_API_KEY).");
  }

  await prisma.$transaction(
    gerados.map((g) =>
      prisma.clientInsight.upsert({
        where: { clientId: g.clientId },
        create: { clientId: g.clientId, severity: g.severity, summary: g.summary },
        update: { severity: g.severity, summary: g.summary, generatedAt: new Date() },
      }),
    ),
  );

  return gerados;
}

/** Gera (ou atualiza) a sugestao de IA de cada cliente ativo, a partir de dados reais do
 * CMMS - sempre sob demanda (botao "Gerar insights"), nunca automatico, dado o baixo volume
 * tipico de clientes por conta. Uso interno (equipe RLP), ve' todos os clientes de uma vez. */
export const generateInsights = asyncHandler(async (req: Request, res: Response) => {
  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: { id: true, companyName: true, tradeName: true, plan: { select: { maxUsers: true, maxInstruments: true } } },
  });

  if (clients.length === 0) {
    res.json([]);
    return;
  }

  const dados = await coletarDadosParaInsight(clients);
  const gerados = await gerarESalvar(dados);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "ClientInsight",
    entityId: "batch",
    description: `Insights gerados para ${gerados.length} cliente(s)`,
  });

  const insights = await prisma.clientInsight.findMany({
    orderBy: { generatedAt: "desc" },
    include: { client: { select: { id: true, companyName: true, tradeName: true } } },
  });
  res.json(insights);
});

/** Autoatendimento do portal: o proprio cliente pede a analise da propria operacao,
 * sem depender da equipe RLP gerar por ele. */
export const getOwnInsight = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.clientId) throw new ForbiddenError();

  const insight = await prisma.clientInsight.findUnique({ where: { clientId: req.user.clientId } });
  res.json(insight);
});

export const generateOwnInsight = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.clientId) throw new ForbiddenError();

  const client = await prisma.client.findUnique({
    where: { id: req.user.clientId, deletedAt: null },
    select: { id: true, companyName: true, tradeName: true, plan: { select: { maxUsers: true, maxInstruments: true } } },
  });
  if (!client) throw new ForbiddenError();

  const dados = await coletarDadosParaInsight([client]);
  await gerarESalvar(dados);

  await writeAuditLog({
    userId: req.user.sub,
    action: "CREATE",
    entityType: "ClientInsight",
    entityId: client.id,
    description: "Insight gerado pelo proprio cliente no portal",
  });

  const insight = await prisma.clientInsight.findUnique({ where: { clientId: client.id } });
  res.json(insight);
});
