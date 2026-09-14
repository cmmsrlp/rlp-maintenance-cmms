import type { Request, Response } from "express";
import { z } from "zod";
import { PredictiveTechnique, MeasurementDirection, ConditionSeverity } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { assertServiceAccess } from "../../middleware/rbac";
import { nextClientMaintenanceOrderNumber } from "../../utils/sequence";
import { recalcularCriticidade } from "../../lib/assetCriticality";

/** Meter nao tem clientId proprio (pertence a um Instrument) - o escopo do cliente
 * e' aplicado via filtro na relacao instrument.clientId. */
function instrumentClientFilter(req: Request) {
  if (req.user?.role === "CLIENT") {
    return { instrument: { clientId: req.user.clientId ?? "" } };
  }
  return {};
}

export const listMeters = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { instrumentId } = req.query as { instrumentId?: string };

  const meters = await prisma.meter.findMany({
    where: { deletedAt: null, ...instrumentClientFilter(req), ...(instrumentId ? { instrumentId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { readings: { orderBy: { readAt: "desc" }, take: 5 } },
  });
  res.json(meters);
});

export const getMeter = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const meter = await prisma.meter.findFirst({
    where: { id: req.params.id, deletedAt: null, ...instrumentClientFilter(req) },
    include: { readings: { orderBy: { readAt: "desc" } } },
  });
  if (!meter) throw new NotFoundError("Medidor");
  res.json(meter);
});

const meterSchema = z.object({
  instrumentId: z.string().uuid(),
  name: z.string().min(1, "Informe o nome do ponto de medicao."),
  unit: z.string().min(1, "Informe a unidade (h, mm/s, °C, dB...)."),
  currentValue: z.coerce.number().nonnegative().optional(),
  technique: z.nativeEnum(PredictiveTechnique).optional(),
  direction: z.nativeEnum(MeasurementDirection).optional(),
  // Zona de alarme (nomes historicos) + aviso antecipado e zona critica.
  minThreshold: z.coerce.number().nullish(),
  maxThreshold: z.coerce.number().nullish(),
  warningLimit: z.coerce.number().nullish(),
  criticalLimit: z.coerce.number().nullish(),
  criterion: z.string().nullish(),
  frequencyDays: z.coerce.number().int().positive().nullish(),
});

/**
 * Em que zona a leitura caiu. E' o coracao da preditiva: em vez de "dentro/fora", a
 * medida cai numa faixa e cada faixa tem uma acao diferente.
 *
 * UPPER (quanto maior pior):  normal < aviso <= ALERTA < alarme <= ALARME < critico <= CRITICO
 * LOWER (quanto menor pior):  CRITICO <= critico < ALARME <= alarme < ALERTA <= aviso < normal
 * RANGE (contador/processo):  dentro de [min,max] = normal, fora = ALARME (comportamento antigo)
 */
function classifyReading(
  meter: { direction: MeasurementDirection; minThreshold: number | null; maxThreshold: number | null; warningLimit: number | null; criticalLimit: number | null },
  value: number,
): ConditionSeverity {
  const { direction, minThreshold, maxThreshold, warningLimit, criticalLimit } = meter;

  if (direction === "UPPER") {
    if (criticalLimit != null && value >= criticalLimit) return "CRITICAL";
    if (maxThreshold != null && value >= maxThreshold) return "ALARM";
    if (warningLimit != null && value >= warningLimit) return "WARNING";
    return "NORMAL";
  }

  if (direction === "LOWER") {
    if (criticalLimit != null && value <= criticalLimit) return "CRITICAL";
    if (minThreshold != null && value <= minThreshold) return "ALARM";
    if (warningLimit != null && value <= warningLimit) return "WARNING";
    return "NORMAL";
  }

  // RANGE: mantem o comportamento de antes da preditiva por zonas.
  const foraDaFaixa = (minThreshold != null && value < minThreshold) || (maxThreshold != null && value > maxThreshold);
  return foraDaFaixa ? "ALARM" : "NORMAL";
}

/** O que cada zona faz. E' aqui que preditiva se separa de alarme: ALERTA nao abre OS,
 * so acende no painel; ALARME programa a intervencao; CRITICO abre para agir agora. */
const SEVERITY_ACTION: Record<ConditionSeverity, { opensWorkOrder: boolean; status: "OPEN" | "PROGRAMMED"; label: string; action: string }> = {
  NORMAL: { opensWorkOrder: false, status: "OPEN", label: "Normal", action: "Operacao normal." },
  WARNING: { opensWorkOrder: false, status: "OPEN", label: "Alerta", action: "Degradacao iniciada: aumentar a frequencia de coleta e acompanhar a tendencia." },
  ALARM: { opensWorkOrder: true, status: "PROGRAMMED", label: "Alarme", action: "Programar a intervencao na proxima oportunidade." },
  CRITICAL: { opensWorkOrder: true, status: "OPEN", label: "Critico", action: "Agir imediatamente - risco de falha funcional." },
};

export const createMeter = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = meterSchema.parse(req.body);
  if (data.minThreshold != null && data.maxThreshold != null && data.minThreshold > data.maxThreshold) {
    throw new ValidationError("O limite minimo nao pode ser maior que o maximo.");
  }

  const instrument = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null } });
  if (!instrument) throw new NotFoundError("Ativo");
  if (req.user?.role === "CLIENT" && instrument.clientId !== req.user.clientId) throw new ForbiddenError();

  const meter = await prisma.meter.create({ data: { ...data, createdById: req.user?.sub } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "Meter",
    entityId: meter.id,
    description: `Medidor ${meter.name} cadastrado`,
  });

  res.status(201).json(meter);
});

export const updateMeter = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = meterSchema.partial().parse(req.body);
  const existing = await prisma.meter.findFirst({ where: { id: req.params.id, deletedAt: null, ...instrumentClientFilter(req) } });
  if (!existing) throw new NotFoundError("Medidor");

  const minThreshold = data.minThreshold !== undefined ? data.minThreshold : existing.minThreshold;
  const maxThreshold = data.maxThreshold !== undefined ? data.maxThreshold : existing.maxThreshold;
  if (minThreshold != null && maxThreshold != null && minThreshold > maxThreshold) {
    throw new ValidationError("O limite minimo nao pode ser maior que o maximo.");
  }
  if (req.user?.role === "CLIENT") delete data.instrumentId; // cliente nao move o medidor para outro ativo

  const meter = await prisma.meter.update({ where: { id: existing.id }, data });
  res.json(meter);
});

export const deleteMeter = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.meter.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Medidor");

  await prisma.meter.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "Meter",
    entityId: existing.id,
    description: `Medidor ${existing.name} removido`,
  });

  res.status(204).send();
});

const readingSchema = z.object({
  value: z.coerce.number().nonnegative(),
  readAt: z.coerce.date().optional(),
  notes: z.string().nullish(),
});

/**
 * Registra a leitura e, se ela ultrapassar a faixa normal do medidor, dispara a
 * manutencao preditiva de verdade: marca a leitura e abre uma OS tipo PREDICTIVE
 * sozinha (sem precisar de ninguem escolher "Preditiva" num formulario). Nao duplica
 * se ja existir uma OS preditiva aberta para o mesmo medidor.
 */
export const addMeterReading = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = readingSchema.parse(req.body);
  const meter = await prisma.meter.findFirst({
    where: { id: req.params.id, deletedAt: null, ...instrumentClientFilter(req) },
    include: { instrument: { select: { id: true, clientId: true, tag: true, type: true, criticality: true } } },
  });
  if (!meter) throw new NotFoundError("Medidor");

  const severity = classifyReading(meter, data.value);
  const policy = SEVERITY_ACTION[severity];
  const alertTriggered = severity !== "NORMAL";

  let triggeredWorkOrder = null;
  if (policy.opensWorkOrder) {
    // "Ja aberta" = qualquer status que nao seja terminal - com o status da OS
    // expandido (Planejada/Programada/Aguardando...), so OPEN/IN_PROGRESS deixaria
    // passar uma duplicata enquanto a preditiva anterior esta em alguma dessas etapas.
    const alreadyOpen = await prisma.maintenanceWorkOrder.findFirst({
      where: { triggeredByMeterId: meter.id, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELED"] } },
    });
    if (alreadyOpen) {
      // A condicao piorou com a OS anterior ainda aberta (ex.: Alarme virou Critico).
      // Nao se abre uma segunda OS para a mesma causa - mas deixar a existente como estava
      // seria pior: ela continuaria "programada, prioridade media" enquanto o equipamento
      // entrou em risco de falha funcional. Entao a propria OS e' escalada.
      const escalouParaCritico = severity === "CRITICAL" && alreadyOpen.priority !== "CRITICAL";
      if (escalouParaCritico) {
        triggeredWorkOrder = await prisma.maintenanceWorkOrder.update({
          where: { id: alreadyOpen.id },
          data: {
            priority: "CRITICAL",
            // Volta para Aberta: "programada para a proxima parada" nao vale mais.
            status: alreadyOpen.status === "PROGRAMMED" || alreadyOpen.status === "PLANNED" ? "OPEN" : alreadyOpen.status,
            observations: `${alreadyOpen.observations ? `${alreadyOpen.observations}
` : ""}Condicao piorou para Critico: "${meter.name}" mediu ${data.value} ${meter.unit}. ${policy.action}`,
          },
        });
        await writeAuditLog({
          userId: req.user?.sub,
          action: "UPDATE",
          entityType: "MaintenanceWorkOrder",
          entityId: alreadyOpen.id,
          description: `OS ${alreadyOpen.number} escalada para Critica - zona Critico em "${meter.name}" (${data.value} ${meter.unit})`,
        });
      }
    } else {
      const number = await nextClientMaintenanceOrderNumber(meter.instrument.clientId);
      // Zona critica sobrepoe a criticidade do ativo: nao existe "critico de baixa
      // prioridade" - a condicao medida ja diz que a falha funcional esta proxima.
      const priority = severity === "CRITICAL" ? "CRITICAL" : meter.instrument.criticality;
      const limite = severity === "CRITICAL" ? meter.criticalLimit : meter.direction === "LOWER" ? meter.minThreshold : meter.maxThreshold;
      triggeredWorkOrder = await prisma.maintenanceWorkOrder.create({
        data: {
          number,
          clientId: meter.instrument.clientId,
          instrumentId: meter.instrument.id,
          type: "PREDICTIVE",
          priority,
          status: policy.status,
          description:
            `${policy.label}: "${meter.name}" mediu ${data.value} ${meter.unit}` +
            (limite != null ? ` (limite ${limite} ${meter.unit})` : "") +
            (meter.criterion ? ` - criterio ${meter.criterion}` : "") +
            `. ${policy.action}`,
          triggeredByMeterId: meter.id,
          createdById: req.user?.sub,
        },
      });
    }
  }

  const readAt = data.readAt ?? new Date();
  const [reading] = await prisma.$transaction([
    prisma.meterReading.create({
      data: { meterId: meter.id, value: data.value, readAt, recordedById: req.user?.sub, alertTriggered, severity, notes: data.notes ?? null },
    }),
    prisma.meter.update({ where: { id: meter.id }, data: { currentValue: data.value, lastReadingAt: readAt } }),
  ]);

  if (triggeredWorkOrder) {
    await writeAuditLog({
      userId: req.user?.sub,
      action: "CREATE",
      entityType: "MaintenanceWorkOrder",
      entityId: triggeredWorkOrder.id,
      description: `OS ${triggeredWorkOrder.number} aberta automaticamente - zona ${policy.label} em "${meter.name}" (${data.value} ${meter.unit})`,
    });
  }

  // Horimetro (COUNTER) e' o que alimenta "horas operadas" do MTBF em Criticidade de
  // ativos - uma leitura nova pode mudar o calculo mesmo sem falha nenhuma ter acontecido.
  if (meter.technique === "COUNTER") {
    await recalcularCriticidade(meter.instrument.id, "HOURS_UPDATED");
  }

  res.status(201).json({ ...reading, severity, severityLabel: policy.label, recommendedAction: policy.action, triggeredWorkOrder });
});

/**
 * Painel da manutencao preditiva: o que exige atencao agora. Ordena por severidade da
 * ultima leitura e acusa separadamente os pontos com coleta atrasada - um ponto que
 * parou de ser medido nao protege ativo nenhum, e sem esse aviso ele some do radar.
 */
export const getPredictivePanel = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId } = req.query as { clientId?: string };

  const scope = req.user?.role === "CLIENT" ? { clientId: req.user.clientId ?? "" } : clientId ? { clientId } : {};

  const meters = await prisma.meter.findMany({
    where: {
      deletedAt: null,
      // COUNTER mede uso (horimetro) e alimenta plano preventivo - nao entra no painel
      // de condicao, senao polui o que precisa de acao tecnica.
      technique: { not: "COUNTER" },
      instrument: { deletedAt: null, ...scope },
    },
    include: {
      instrument: { select: { id: true, tag: true, type: true, description: true, criticality: true } },
      readings: { orderBy: { readAt: "desc" }, take: 12 },
    },
  });

  const now = Date.now();
  const points = meters.map((m) => {
    const last = m.readings[0] ?? null;
    const dueInDays = m.frequencyDays != null && m.lastReadingAt
      ? Math.ceil((new Date(m.lastReadingAt).getTime() + m.frequencyDays * 86400000 - now) / 86400000)
      : null;
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      technique: m.technique,
      direction: m.direction,
      criterion: m.criterion,
      frequencyDays: m.frequencyDays,
      lastReadingAt: m.lastReadingAt,
      // Nunca medido e' diferente de em dia: sem leitura nao da para afirmar condicao.
      neverMeasured: last == null,
      collectionOverdue: dueInDays != null && dueInDays < 0,
      dueInDays,
      severity: last?.severity ?? null,
      lastValue: last?.value ?? null,
      limits: { warning: m.warningLimit, alarm: m.direction === "LOWER" ? m.minThreshold : m.maxThreshold, critical: m.criticalLimit },
      instrument: m.instrument,
      // Tendencia mais antiga -> mais nova, para o grafico da tela.
      trend: [...m.readings].reverse().map((r) => ({ value: r.value, readAt: r.readAt, severity: r.severity })),
    };
  });

  const rank: Record<string, number> = { CRITICAL: 0, ALARM: 1, WARNING: 2, NORMAL: 3 };
  const needsAttention = points
    .filter((p) => p.severity && p.severity !== "NORMAL")
    .sort((a, b) => (rank[a.severity!] ?? 9) - (rank[b.severity!] ?? 9));

  res.json({
    totals: {
      points: points.length,
      critical: points.filter((p) => p.severity === "CRITICAL").length,
      alarm: points.filter((p) => p.severity === "ALARM").length,
      warning: points.filter((p) => p.severity === "WARNING").length,
      normal: points.filter((p) => p.severity === "NORMAL").length,
      neverMeasured: points.filter((p) => p.neverMeasured).length,
      collectionOverdue: points.filter((p) => p.collectionOverdue).length,
    },
    needsAttention,
    collectionOverdue: points.filter((p) => p.collectionOverdue || p.neverMeasured),
    points,
  });
});
