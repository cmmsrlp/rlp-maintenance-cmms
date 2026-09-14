import type { Prisma, CriticalityChangeTrigger, CriticalityClass, CriticalityTrend } from "@prisma/client";
import { prisma } from "./prisma";
import { addMonths } from "./dateMath";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Nota de falhas (Q, 1-5) a partir da quantidade de falha funcional nos ultimos 12 meses.
 * Falha funcional = OS corretiva de quebra (type CORRECTIVE + correctiveType BREAKDOWN)
 * concluida - e' o mesmo criterio usado no resto do CMMS pra "quebra de verdade" (nao uma
 * corretiva programada em operacao).
 *
 * MTBF (horas operadas / numero de falhas) anda sempre junto da contagem - pra um mesmo
 * ativo, mais falhas no periodo SEMPRE significa MTBF menor (mesmo denominador de horas).
 * Por isso a nota nasce da contagem: da o mesmo resultado que bandear por MTBF, sem
 * precisar inventar uma faixa de MTBF "esperado" por tipo de equipamento (isso teria que
 * ser configuravel por ativo, e o pedido nao definiu essa tabela).
 */
function notaDeFalha(falhas12m: number): number {
  if (falhas12m <= 0) return 1;
  if (falhas12m === 1) return 2;
  if (falhas12m === 2) return 3;
  if (falhas12m === 3) return 4;
  return 5;
}

function classeDaCriticidade(indice: number): CriticalityClass {
  if (indice >= 60) return "A";
  if (indice >= 25) return "B";
  return "C";
}

interface DadosDeFalha {
  falhas12m: number;
  horasOperadas12m: number | null;
  mtbfHoras: number | null;
  temHistoricoSuficiente: boolean;
}

/**
 * Busca o que alimenta Q: falhas funcionais concluidas nos ultimos 12 meses e horas
 * operadas no mesmo periodo (via medidor tipo horimetro/contador do ativo, quando existe).
 * "Historico suficiente" exige pelo menos UM dos dois sinais (falha registrada OU medidor
 * de horas) - sem nenhum dos dois nao ha base nenhuma pra julgar, e a tela mostra "Dados
 * insuficientes" em vez de inventar uma nota.
 */
async function buscarDadosDeFalha(db: Db, instrumentId: string): Promise<DadosDeFalha> {
  const corte = addMonths(new Date(), -12);

  const [falhas12m, existeFalhaAlgumDia, contador] = await Promise.all([
    db.maintenanceWorkOrder.count({
      where: {
        instrumentId,
        type: "CORRECTIVE",
        correctiveType: "BREAKDOWN",
        status: "COMPLETED",
        deletedAt: null,
        completedAt: { gte: corte },
      },
    }),
    db.maintenanceWorkOrder.count({
      where: { instrumentId, type: "CORRECTIVE", correctiveType: "BREAKDOWN", status: "COMPLETED", deletedAt: null },
      take: 1,
    }),
    db.meter.findFirst({
      where: { instrumentId, technique: "COUNTER", deletedAt: null },
      select: { id: true, currentValue: true },
    }),
  ]);

  let horasOperadas12m: number | null = null;
  if (contador) {
    const leituras = await db.meterReading.findMany({
      where: { meterId: contador.id, readAt: { gte: corte } },
      orderBy: { readAt: "asc" },
      select: { value: true },
    });
    if (leituras.length >= 2) {
      const primeira = leituras[0].value;
      const ultima = leituras[leituras.length - 1].value;
      horasOperadas12m = Math.max(0, ultima - primeira);
    }
  }

  const mtbfHoras = horasOperadas12m != null && falhas12m > 0 ? horasOperadas12m / falhas12m : null;
  const temHistoricoSuficiente = existeFalhaAlgumDia > 0 || horasOperadas12m != null;

  return { falhas12m, horasOperadas12m, mtbfHoras, temHistoricoSuficiente };
}

/**
 * Recalcula a criticidade de um ativo (local funcional) e grava um retrato no historico.
 * Cria a linha de AssetCriticality na primeira vez (S/P nascem em 1 - alguem ainda precisa
 * revisar). So mexe em Q quando a origem continua AUTO; uma nota de falha sobrescrita a
 * mao (origin MANUAL) fica intocada ate a pessoa reverter pra automatica.
 */
export async function recalcularCriticidade(
  instrumentId: string,
  trigger: CriticalityChangeTrigger,
  opts: { db?: Db; responsibleId?: string; reason?: string } = {},
) {
  const db = opts.db ?? prisma;

  const instrument = await db.instrument.findFirst({ where: { id: instrumentId, deletedAt: null }, select: { id: true, clientId: true } });
  if (!instrument) return null;

  const existente = await db.assetCriticality.findUnique({ where: { instrumentId } });
  const dados = await buscarDadosDeFalha(db, instrumentId);

  const novaNotaAuto = dados.temHistoricoSuficiente ? notaDeFalha(dados.falhas12m) : null;
  const origemAtual = existente?.failureScoreOrigin ?? "AUTO";
  const failureScore = origemAtual === "MANUAL" ? (existente?.failureScore ?? null) : novaNotaAuto;

  const safetyScore = existente?.safetyScore ?? 1;
  const productionScore = existente?.productionScore ?? 1;
  const consequenceScore = Math.max(safetyScore, productionScore);

  let criticalityIndex: number | null = null;
  if (failureScore != null) {
    criticalityIndex = 4 * consequenceScore * failureScore;
  }
  // Regra explicita e independente do calculo de Q: Seguranca 4/5 ou Producao 5 sempre e'
  // Classe A - inclusive SEM historico de falha ainda (um ativo de alto risco nao pode
  // aparecer como "dados insuficientes" so porque nunca quebrou). So sem essa regra a classe
  // depende do indice, que por sua vez exige Q (senao fica "dados insuficientes" mesmo).
  const criticalityClass: CriticalityClass | null =
    safetyScore >= 4 || productionScore === 5 ? "A" : criticalityIndex != null ? classeDaCriticidade(criticalityIndex) : null;

  const anterior = existente?.failureScore ?? null;
  let trend: CriticalityTrend | null = null;
  if (failureScore != null && anterior != null) {
    trend = failureScore > anterior ? "UP" : failureScore < anterior ? "DOWN" : "STABLE";
  }

  const atualizado = await db.assetCriticality.upsert({
    where: { instrumentId },
    create: {
      instrumentId,
      clientId: instrument.clientId,
      safetyScore: 1,
      productionScore: 1,
      failureScore,
      failureScoreOrigin: "AUTO",
      previousFailureScore: null,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
      trend: null,
      mtbfHours: dados.mtbfHoras,
      failureCount12m: dados.falhas12m,
      operatingHours12m: dados.horasOperadas12m,
      lastCalculatedAt: new Date(),
    },
    update: {
      failureScore,
      previousFailureScore: origemAtual === "AUTO" ? anterior : existente?.previousFailureScore,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
      trend,
      mtbfHours: dados.mtbfHoras,
      failureCount12m: dados.falhas12m,
      operatingHours12m: dados.horasOperadas12m,
      lastCalculatedAt: new Date(),
    },
  });

  await db.assetCriticalityLog.create({
    data: {
      criticalityId: atualizado.id,
      trigger,
      origin: "AUTO",
      safetyScore: atualizado.safetyScore,
      productionScore: atualizado.productionScore,
      failureScore: atualizado.failureScore,
      criticalityIndex: atualizado.criticalityIndex,
      criticalityClass: atualizado.criticalityClass,
      reason: opts.reason ?? null,
      responsibleId: opts.responsibleId ?? null,
    },
  });

  return atualizado;
}
