import type { Request, Response } from "express";
import { z } from "zod";
import { dataOpcional } from "../../utils/zod";
import { MaintenanceTriggerType, MaintenancePlanStatus, MaintenancePlanType, MaintenancePlanScope, MaintenancePriority, MaintenanceFrequencyUnit, OperationalCalendar, MeterResetRule, MaintenanceTriggerMode, MaintenanceOrderStatus, MaterialPolicy, ChecklistResponseType, LubricationMethod, type AttachmentCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, assertServiceAccess, assertOwnClient, resolveClientId, resolveClientScope } from "../../middleware/rbac";
import { deriveDueStatus, computeNextDueDate } from "../../utils/status";
import { computeNextDue, computeGenerationDate, frequencyToDays, forecastMeterDue, type TimeScheduleConfig } from "../../lib/planSchedule";
import { nextClientMaintenanceOrderNumber, nextClientMaintenancePlanCode } from "../../utils/sequence";
import { reserveSparePart } from "../../lib/inventory";
import { getStorageProvider } from "../../lib/storage";

const detailInclude = {
  client: { select: { id: true, companyName: true, tradeName: true } },
  instrument: { select: { id: true, type: true, model: true, serialNumber: true, tag: true, description: true, criticality: true, costCenterId: true } },
  meter: { select: { id: true, name: true, unit: true, currentValue: true } },
  responsible: { select: { id: true, name: true } },
  specialty: { select: { id: true, name: true } },
  checklistTemplate: { orderBy: { sortOrder: "asc" as const } },
  template: { select: { id: true, name: true } },
  parts: {
    include: {
      sparePart: { select: { id: true, name: true, code: true, unit: true, stockQty: true, reservedQty: true } },
      alternativeSparePart: { select: { id: true, name: true, code: true, unit: true, stockQty: true, reservedQty: true } },
    },
  },
};

/** Status derivado do plano: TIME usa a mesma janela de vencimento de calibracao/contrato;
 * METER compara a leitura atual do medidor com a leitura na ultima geracao + intervalo. */
function withDerivedStatus<
  T extends {
    triggerType: MaintenanceTriggerType;
    nextDueDate: Date | null;
    meterInterval: number | null;
    lastMeterAtGeneration: number | null;
    meter: { currentValue: number } | null;
  },
>(plan: T) {
  if (plan.triggerType === "TIME") {
    return { ...plan, derivedStatus: deriveDueStatus(plan.nextDueDate) };
  }
  if (plan.meter && plan.meterInterval != null) {
    const used = plan.meter.currentValue - (plan.lastMeterAtGeneration ?? 0);
    const remaining = plan.meterInterval - used;
    const derivedStatus = remaining < 0 ? "EXPIRED" : remaining <= plan.meterInterval * 0.1 ? "DUE_SOON" : "VALID";
    return { ...plan, derivedStatus };
  }
  return { ...plan, derivedStatus: "VALID" as const };
}

export const listMaintenancePlans = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, instrumentId, active } = req.query as { clientId?: string; instrumentId?: string; active?: string };

  const where = {
    deletedAt: null,
    ...resolveClientScope(req, clientId),
    ...(instrumentId ? { instrumentId } : {}),
    ...(active !== undefined ? { active: active === "true" } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.maintenancePlan.findMany({
      where,
      orderBy: { nextDueDate: "asc" },
      ...toSkipTake(pageParams),
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        instrument: { select: { id: true, type: true, model: true, serialNumber: true, tag: true } },
        meter: { select: { id: true, name: true, unit: true, currentValue: true } },
      },
    }),
    prisma.maintenancePlan.count({ where }),
  ]);

  res.json(buildPagedResult(items.map(withDerivedStatus), total, pageParams));
});

export const getMaintenancePlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: {
      ...detailInclude,
      workOrders: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, status: true, completedAt: true } },
    },
  });
  if (!plan) throw new NotFoundError("Plano de manutencao");

  // Datas derivadas do agendamento - calculadas na hora, nunca gravadas, para nao existir
  // uma copia que envelhece.
  const nextGenerationDate = plan.nextDueDate
    ? computeGenerationDate(plan.nextDueDate, plan.generateAdvanceDays)
    : null;

  // Previsao por consumo medio: so faz sentido no disparo por medidor.
  let meterForecast = null;
  if (plan.meterId && plan.meterInterval != null) {
    const readings = await prisma.meterReading.findMany({
      where: { meterId: plan.meterId },
      orderBy: { readAt: "desc" },
      take: 30,
      select: { value: true, readAt: true },
    });
    const meter = await prisma.meter.findUnique({ where: { id: plan.meterId }, select: { currentValue: true } });
    meterForecast = forecastMeterDue(
      readings,
      plan.meterBaseReading ?? plan.lastMeterAtGeneration,
      plan.meterInterval,
      meter?.currentValue ?? 0,
    );
  }

  res.json({ ...withDerivedStatus(plan), schedule: { nextGenerationDate, meterForecast } });
});

const checklistItemSchema = z.object({
  description: z.string().min(1),
  section: z.string().nullish(),
  required: z.boolean().optional(),
  responseType: z.nativeEnum(ChecklistResponseType).optional(),
  unit: z.string().nullish(),
  minValue: z.coerce.number().nullish(),
  maxValue: z.coerce.number().nullish(),
  targetValue: z.coerce.number().nullish(),
  requiresPhoto: z.boolean().optional(),
  reference: z.string().nullish(),
  // Tempo esperado nesta operacao - somado, da a duracao estimada do servico.
  estimatedMinutes: z.coerce.number().int().nonnegative().nullish(),
});
const planPartSchema = z.object({
  sparePartId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  required: z.boolean().optional(),
  alternativeSparePartId: z.string().uuid().nullish(),
  suggestedSupplier: z.string().nullish(),
  notes: z.string().nullish(),
});

const planSchema = z.object({
  clientId: z.string().uuid().optional(),
  // Opcional: um plano pode nascer sem ativo (uma inspecao geral, por exemplo) e ganhar um
  // mais tarde, na edicao - o codigo sequencial (PM-0001) e' o que identifica o plano
  // enquanto isso, e o nome digitado pelo usuario descreve do que se trata.
  instrumentId: z.string().uuid().nullish(),
  name: z.string().min(2, "Informe o nome do plano."),
  description: z.string().nullish(),
  triggerType: z.nativeEnum(MaintenanceTriggerType),
  frequencyDays: z.coerce.number().int().positive().nullish(),
  meterId: z.string().uuid().nullish(),
  meterInterval: z.coerce.number().positive().nullish(),
  active: z.boolean().optional(),
  status: z.nativeEnum(MaintenancePlanStatus).optional(),
  planType: z.nativeEnum(MaintenancePlanType).optional(),
  scope: z.nativeEnum(MaintenancePlanScope).optional(),
  defaultPriority: z.nativeEnum(MaintenancePriority).optional(),
  specialtyId: z.string().uuid().nullish(),
  responsibleId: z.string().uuid().nullish(),
  // Agendamento
  frequencyUnit: z.nativeEnum(MaintenanceFrequencyUnit).optional(),
  frequencyEvery: z.coerce.number().int().positive().nullish(),
  baseDate: dataOpcional,
  dayOfWeek: z.coerce.number().int().min(0).max(6).nullish(),
  dayOfMonth: z.coerce.number().int().min(1).max(31).nullish(),
  monthOfYear: z.coerce.number().int().min(1).max(12).nullish(),
  operationalCalendar: z.nativeEnum(OperationalCalendar).optional(),
  blockedDates: z.array(z.coerce.date()).optional(),
  generateAdvanceDays: z.coerce.number().int().nonnegative().nullish(),
  meterBaseReading: z.coerce.number().nullish(),
  generateAdvanceMeterUnits: z.coerce.number().nonnegative().nullish(),
  toleranceMeterBefore: z.coerce.number().nonnegative().nullish(),
  toleranceMeterAfter: z.coerce.number().nonnegative().nullish(),
  meterResetRule: z.nativeEnum(MeterResetRule).optional(),
  triggerMode: z.nativeEnum(MaintenanceTriggerMode).optional(),
  conditionMeterId: z.string().uuid().nullish(),
  // Como a OS gerada nasce
  initialWorkOrderStatus: z.nativeEnum(MaintenanceOrderStatus).optional(),
  requiresShutdown: z.boolean().optional(),
  estimatedShutdownHours: z.coerce.number().nonnegative().nullish(),
  requiresOperationalRelease: z.boolean().optional(),
  requiresLoto: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  groupWorkOrder: z.boolean().optional(),
  materialPolicy: z.nativeEnum(MaterialPolicy).optional(),
  checklistTemplate: z.array(checklistItemSchema).optional(),
  // Tolerancia informativa (nao reescreve deriveDueStatus, so exibida na tela do plano);
  // procedimento/HH prevista/materiais previstos alimentam o backlog do PCM e a OS gerada.
  toleranceDaysBefore: z.coerce.number().int().nonnegative().nullish(),
  toleranceDaysAfter: z.coerce.number().int().nonnegative().nullish(),
  procedure: z.string().nullish(),
  estimatedLaborHours: z.coerce.number().nonnegative().nullish(),
  // Procedimento/cuidados do plano - vira a descricao da OS gerada.
  instructions: z.string().nullish(),
  // Lubrificacao: so faz sentido em plano do tipo Lubrificacao (validado na escrita).
  lubricantSparePartId: z.string().uuid().nullish(),
  lubricationPoints: z.coerce.number().int().positive().nullish(),
  lubricantQtyPerPoint: z.coerce.number().positive().nullish(),
  lubricationMethod: z.nativeEnum(LubricationMethod).nullish(),
  templateId: z.string().uuid().nullish(),
  parts: z.array(planPartSchema).optional(),
});

/** Monta a config de calendario que o motor de agendamento espera. */
function scheduleConfigOf(plan: {
  frequencyUnit: MaintenanceFrequencyUnit;
  frequencyEvery: number | null;
  frequencyDays: number | null;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  operationalCalendar: OperationalCalendar;
  blockedDates: Date[];
}): TimeScheduleConfig {
  return {
    frequencyUnit: plan.frequencyUnit,
    frequencyEvery: plan.frequencyEvery,
    frequencyDays: plan.frequencyDays,
    dayOfWeek: plan.dayOfWeek,
    dayOfMonth: plan.dayOfMonth,
    monthOfYear: plan.monthOfYear,
    operationalCalendar: plan.operationalCalendar,
    blockedDates: plan.blockedDates ?? [],
  };
}

const UNIDADE_LABEL: Record<MaintenanceFrequencyUnit, [string, string]> = {
  DAY: ["dia", "dias"],
  WEEK: ["semana", "semanas"],
  MONTH: ["mes", "meses"],
  YEAR: ["ano", "anos"],
};

/** Memoria de calculo do proximo vencimento, em texto - o proprio numero de dias entre
 * data-base e vencimento pode parecer errado a um olho destreinado (mes tem 28-31 dias,
 * nao 30 fixos, e o ajuste de calendario pode empurrar mais alguns dias), e nao ha como
 * conferir a conta sem ver os componentes que entraram nela (achado em reavaliacao: um
 * vencimento correto foi lido como incorreto por falta dessa memoria). */
function memoriaDeCalculoDoVencimento(plan: {
  triggerType: string;
  baseDate: Date | null;
  frequencyEvery: number | null;
  frequencyUnit: MaintenanceFrequencyUnit;
  dayOfMonth: number | null;
  operationalCalendar: OperationalCalendar;
  toleranceDaysBefore: number | null;
  toleranceDaysAfter: number | null;
  generateAdvanceDays: number | null;
  nextDueDate: Date | null;
}): string | null {
  if (plan.triggerType !== "TIME" || !plan.baseDate || !plan.frequencyEvery || !plan.nextDueDate) return null;

  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const [singular, plural] = UNIDADE_LABEL[plan.frequencyUnit];
  const partes = [
    `Data-base ${fmt(plan.baseDate)} + ${plan.frequencyEvery} ${plan.frequencyEvery === 1 ? singular : plural}`,
    plan.dayOfMonth ? `ancorado no dia ${plan.dayOfMonth}` : null,
    plan.operationalCalendar === "BUSINESS_DAYS" ? "ajustado para dia util" : null,
  ].filter(Boolean);
  let texto = `${partes.join(", ")} = vencimento em ${fmt(plan.nextDueDate)}.`;
  if (plan.generateAdvanceDays) {
    texto += ` A OS pode ser gerada ${plan.generateAdvanceDays} dia(s) antes (a partir de ${fmt(computeGenerationDate(plan.nextDueDate, plan.generateAdvanceDays))}).`;
  }
  if (plan.toleranceDaysBefore || plan.toleranceDaysAfter) {
    texto += ` Conta como no prazo de ${plan.toleranceDaysBefore ?? 0} dia(s) antes ate ${plan.toleranceDaysAfter ?? 0} dia(s) depois do vencimento.`;
  }
  return texto;
}

/** Campos cuja mudanca desloca o ciclo do plano - o pedido e' que cada alteracao desses
 * fique registrada na auditoria e recalcule o vencimento sem apagar o historico. */
const CAMPOS_DE_AGENDAMENTO = [
  "triggerType", "frequencyUnit", "frequencyEvery", "frequencyDays", "baseDate", "dayOfWeek",
  "dayOfMonth", "monthOfYear", "operationalCalendar", "generateAdvanceDays", "toleranceDaysBefore",
  "toleranceDaysAfter", "meterId", "meterInterval", "meterBaseReading", "toleranceMeterBefore",
  "toleranceMeterAfter", "meterResetRule", "triggerMode", "conditionMeterId",
] as const;

async function assertPartsBelongToClient(parts: { sparePartId: string }[], clientId: string) {
  const ids = [...new Set(parts.map((p) => p.sparePartId))];
  const found = await prisma.sparePart.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, clientId: true } });
  if (found.length !== ids.length) throw new ValidationError("Uma das pecas informadas nao existe.");
  if (found.some((p) => p.clientId !== clientId)) throw new ValidationError("Uma das pecas informadas pertence a outra empresa.");
}

/** Os campos de lubrificacao so descrevem alguma coisa num plano de lubrificacao; noutro
 * tipo eles ficariam guardados sem significado nenhum. */
function assertLubrificacaoCoerente(
  planType: MaintenancePlanType | undefined,
  dados: { lubricantSparePartId?: string | null; lubricationPoints?: number | null; lubricantQtyPerPoint?: number | null; lubricationMethod?: LubricationMethod | null },
) {
  const preencheu =
    !!dados.lubricantSparePartId || dados.lubricationPoints != null || dados.lubricantQtyPerPoint != null || !!dados.lubricationMethod;
  if (preencheu && planType && planType !== "LUBRICATION") {
    throw new ValidationError("Os dados de lubrificacao so se aplicam a plano do tipo Lubrificacao.");
  }
}


/**
 * Plano de calibracao manda na periodicidade do ativo.
 *
 * A periodicidade saiu da ficha do ativo: era um numero solto, digitado uma vez e nunca
 * mais olhado, que ninguem sabia de onde tinha vindo. Agora ela vive no plano de
 * calibracao, que e' onde se decide o que sera feito e quando - e o ativo apenas
 * acompanha, para o vencimento e o certificado seguirem funcionando como antes.
 */
async function sincronizarPeriodicidadeDeCalibracao(planId: string): Promise<void> {
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: planId, deletedAt: null },
    select: { planType: true, status: true, instrumentId: true, frequencyDays: true },
  });
  if (!plan || !plan.instrumentId || plan.planType !== "CALIBRATION" || plan.status !== "ACTIVE" || !plan.frequencyDays) return;

  // frequencyDays ja e' o intervalo normalizado do plano; a ficha do ativo fala em meses.
  const meses = Math.max(1, Math.round(plan.frequencyDays / 30));
  const instrument = await prisma.instrument.findFirst({
    where: { id: plan.instrumentId, deletedAt: null },
    select: { id: true, lastCalibrationDate: true, calibrationFrequencyMonths: true },
  });
  if (!instrument || instrument.calibrationFrequencyMonths === meses) return;

  await prisma.instrument.update({
    where: { id: instrument.id },
    data: {
      calibratable: true,
      calibrationFrequencyMonths: meses,
      nextDueDate: instrument.lastCalibrationDate
        ? computeNextDueDate(instrument.lastCalibrationDate, meses)
        : undefined,
    },
  });
}

/**
 * Calibracao periodica rastreada e' algo que a equipe interna acompanha de perto: o
 * cliente pode criar o plano sozinho, mas sem um aviso ele ficaria enterrado na lista dele
 * e a equipe nunca saberia que precisa dar suporte tecnico (padrao, procedimento, etc.).
 */
async function alertarEquipeSobrePlanoDeCalibracao(plan: { id: string; name: string; code: string | null; client: { companyName: string } }) {
  const equipe = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "COMMERCIAL"] }, active: true, deletedAt: null },
    select: { id: true },
  });
  if (equipe.length === 0) return;
  await prisma.notification.createMany({
    data: equipe.map((u) => ({
      userId: u.id,
      title: "Plano de calibracao criado pelo cliente",
      message: `${plan.client.companyName} criou o plano ${plan.code ?? plan.name} (${plan.name}) - de calibracao periodica rastreada.`,
      link: `/gestao/manutencao/planos/${plan.id}`,
    })),
  });
}

export const createMaintenancePlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = planSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);
  // A periodicidade agora vem como "a cada X <unidade>"; frequencyDays e' o valor derivado,
  // mantido para os planos antigos que so tinham dias.
  if (data.triggerType === "TIME" && !data.frequencyEvery && !data.frequencyDays) {
    throw new ValidationError("Informe a periodicidade para um plano por tempo.");
  }
  if (data.triggerType === "METER" && (!data.meterId || !data.meterInterval)) {
    throw new ValidationError("Informe o medidor e o intervalo para um plano por medidor.");
  }

  // Ativo e' opcional na criacao - um plano pode nascer so com nome e periodicidade (uma
  // inspecao geral, por exemplo) e ganhar o ativo depois, na edicao. So valida quando
  // um ativo de fato foi escolhido.
  if (data.instrumentId) {
    const instrument = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null }, select: { clientId: true } });
    if (!instrument) throw new NotFoundError("Ativo");
    if (instrument.clientId !== clientId) throw new ValidationError("Esse ativo pertence a outra empresa.");
  }

  if (data.parts?.length) await assertPartsBelongToClient(data.parts, clientId);
  assertLubrificacaoCoerente(data.planType, data);

  const { checklistTemplate, parts, ...planData } = data;
  // Periodicidade em dias e' derivada da unidade escolhida - "a cada 3 meses" vira 90
  // dias para quem ainda pensa em dias, sem o usuario ter que fazer essa conta.
  const frequencyUnit = planData.frequencyUnit ?? "DAY";
  const frequencyEvery = planData.frequencyEvery ?? planData.frequencyDays ?? null;
  const frequencyDays = frequencyEvery ? frequencyToDays(frequencyUnit, frequencyEvery) : null;
  const baseDate = planData.baseDate ?? new Date();

  const nextDueDate =
    data.triggerType === "TIME"
      ? computeNextDue(baseDate, {
          frequencyUnit,
          frequencyEvery,
          frequencyDays,
          dayOfWeek: planData.dayOfWeek ?? null,
          dayOfMonth: planData.dayOfMonth ?? null,
          monthOfYear: planData.monthOfYear ?? null,
          operationalCalendar: planData.operationalCalendar ?? "ALL_DAYS",
          blockedDates: planData.blockedDates ?? [],
        })
      : null;

  const code = await nextClientMaintenancePlanCode(clientId);
  // "active" continua no banco por compatibilidade, mas quem manda e' o status: manter
  // os dois em sincronia evita um plano Suspenso continuar gerando OS.
  const status = planData.status ?? "ACTIVE";

  const plan = await prisma.maintenancePlan.create({
    data: {
      ...planData,
      code,
      status,
      active: status === "ACTIVE",
      clientId,
      frequencyUnit,
      frequencyEvery,
      frequencyDays,
      baseDate,
      nextDueDate,
      createdById: req.user?.sub,
      checklistTemplate: { create: (checklistTemplate ?? []).map((c, i) => ({ ...c, sortOrder: i })) },
      parts: { create: (parts ?? []).map((p) => ({ ...p })) },
    },
    include: detailInclude,
  });

  await sincronizarPeriodicidadeDeCalibracao(plan.id);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "MaintenancePlan",
    entityId: plan.id,
    description: `Plano de manutencao "${plan.name}" criado`,
  });

  // So avisa quando quem criou e' do lado do cliente - a propria equipe interna, criando
  // pelo acesso master, ja sabe que criou.
  if (plan.planType === "CALIBRATION" && ["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN"].includes(req.user?.role ?? "")) {
    await alertarEquipeSobrePlanoDeCalibracao(plan);
  }

  res.status(201).json(withDerivedStatus(plan));
});

export const updateMaintenancePlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = planSchema.partial().parse(req.body);
  const existing = await prisma.maintenancePlan.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, existing.clientId);

  // Ativo pode ser atribuido agora, num plano que nasceu sem um (a inspecao geral virou
  // "sobre este ativo especifico").
  if (data.instrumentId && data.instrumentId !== existing.instrumentId) {
    const instrument = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null }, select: { clientId: true } });
    if (!instrument) throw new NotFoundError("Ativo");
    if (instrument.clientId !== existing.clientId) throw new ValidationError("Esse ativo pertence a outra empresa.");
  }

  if (data.parts) await assertPartsBelongToClient(data.parts, existing.clientId);

  const { checklistTemplate, parts, ...planData } = data;
  if (req.user?.role === "CLIENT") delete planData.clientId;
  const triggerType = data.triggerType ?? existing.triggerType;
  const frequencyUnit = planData.frequencyUnit ?? existing.frequencyUnit;
  const frequencyEvery = planData.frequencyEvery ?? existing.frequencyEvery ?? existing.frequencyDays;
  const frequencyDays = frequencyEvery ? frequencyToDays(frequencyUnit, frequencyEvery) : existing.frequencyDays;
  const baseDate = planData.baseDate ?? existing.baseDate ?? existing.createdAt;

  // Mudou algo que desloca o ciclo? Entao recalcula o vencimento a partir da data-base -
  // e registra o que mudou, sem apagar o historico anterior do plano.
  const mudancasDeAgendamento = CAMPOS_DE_AGENDAMENTO.filter((campo) => {
    const novo = (planData as Record<string, unknown>)[campo];
    if (novo === undefined) return false;
    const atual = (existing as Record<string, unknown>)[campo];
    if (novo instanceof Date && atual instanceof Date) return novo.getTime() !== atual.getTime();
    return novo !== atual;
  });

  const nextDueDate =
    triggerType === "TIME" && frequencyEvery
      ? computeNextDue(baseDate, {
          frequencyUnit,
          frequencyEvery,
          frequencyDays,
          dayOfWeek: planData.dayOfWeek ?? existing.dayOfWeek,
          dayOfMonth: planData.dayOfMonth ?? existing.dayOfMonth,
          monthOfYear: planData.monthOfYear ?? existing.monthOfYear,
          operationalCalendar: planData.operationalCalendar ?? existing.operationalCalendar,
          blockedDates: planData.blockedDates ?? existing.blockedDates,
        })
      : existing.nextDueDate;

  const statusFinal = planData.status ?? existing.status;

  const plan = await prisma.maintenancePlan.update({
    where: { id: existing.id },
    data: {
      ...planData,
      status: statusFinal,
      active: statusFinal === "ACTIVE",
      frequencyUnit,
      frequencyEvery,
      frequencyDays,
      baseDate,
      nextDueDate,
      ...(checklistTemplate
        ? {
            checklistTemplate: {
              deleteMany: {},
              create: checklistTemplate.map((c, i) => ({ ...c, sortOrder: i })),
            },
          }
        : {}),
      ...(parts
        ? {
            parts: {
              deleteMany: {},
              create: parts.map((p) => ({ ...p })),
            },
          }
        : {}),
    },
    include: detailInclude,
  });

  await sincronizarPeriodicidadeDeCalibracao(plan.id);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenancePlan",
    entityId: plan.id,
    description: `Plano de manutencao "${plan.name}" atualizado`,
  });

  if (mudancasDeAgendamento.length > 0) {
    await writeAuditLog({
      userId: req.user?.sub,
      action: "UPDATE",
      entityType: "MaintenancePlan",
      entityId: plan.id,
      description:
        `Agendamento do plano ${plan.code ?? plan.name} alterado (${mudancasDeAgendamento.join(", ")}). ` +
        `Proximo vencimento recalculado para ${plan.nextDueDate ? plan.nextDueDate.toISOString().slice(0, 10) : "nao aplicavel"}.`,
    });
  }

  // Virou plano de calibracao agora (nao era antes) - mesmo aviso da criacao.
  if (plan.planType === "CALIBRATION" && existing.planType !== "CALIBRATION" && ["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN"].includes(req.user?.role ?? "")) {
    await alertarEquipeSobrePlanoDeCalibracao(plan);
  }

  res.json(withDerivedStatus(plan));
});

export const deleteMaintenancePlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenancePlan.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, existing.clientId);

  await prisma.maintenancePlan.update({ where: { id: existing.id }, data: { deletedAt: new Date(), active: false } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "MaintenancePlan",
    entityId: existing.id,
    description: `Plano de manutencao "${existing.name}" removido`,
  });

  res.status(204).send();
});

/** Gera uma Ordem de Manutencao preventiva a partir do plano, copiando o checklist e
 * avancando a proxima data/leitura de referencia - mesma logica de "Nova calibracao"
 * a partir do Ativo, so que sem worker/cron (nao ha infraestrutura para isso aqui). */
/**
 * Gera a Ordem de Manutencao de um plano: copia checklist e procedimento, resolve o
 * material conforme a politica, cria a OS e avanca o ciclo do plano.
 *
 * Usada nos dois caminhos - o botao "Gerar OS" e o disparo automatico quando a
 * antecedencia e' atingida - para que os dois facam exatamente a mesma coisa. Quando
 * chamada pelo automatico (`automatica`), devolve o motivo em vez de lancar erro: um plano
 * que nao pode gerar nao pode derrubar a rodada dos outros.
 */
async function criarOsDoPlano(planId: string, opcoes: { userId?: string; automatica?: boolean; forcar?: boolean }) {
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: planId, deletedAt: null },
    include: {
      checklistTemplate: { orderBy: { sortOrder: "asc" } },
      meter: true,
      parts: true,
      instrument: { select: { costCenterId: true } },
    },
  });
  if (!plan) throw new NotFoundError("Plano de manutencao");
  if (plan.status !== "ACTIVE") {
    const motivo: Record<string, string> = {
      DRAFT: "Este plano ainda e' um rascunho.",
      SUSPENDED: "Este plano esta suspenso.",
      CLOSED: "Este plano foi encerrado.",
    };
    throw new ValidationError(`${motivo[plan.status] ?? "Plano inativo."} So plano Ativo gera ordem de manutencao.`);
  }
  // A OS precisa de um ativo (nao existe OS "no ar") - um plano criado sem ativo fica
  // parado ate alguem editar e escolher um. A automatica cai em "ignorados", nao em erro
  // de rodada: nao e' um problema do plano, e' so cedo demais para gerar.
  if (!plan.instrumentId) {
    throw new ValidationError("Este plano ainda nao tem um ativo vinculado. Edite o plano e escolha um ativo antes de gerar a OS.");
  }

  // Uma OS aberta por vez. Sem isso, a rodada automatica criaria uma OS a cada passada e o
  // botao "Gerar OS" clicado duas vezes faria o mesmo - so que a segunda ja pertenceria ao
  // ciclo seguinte, nascendo meses antes da hora. Enquanto a preventiva anterior nao for
  // concluida ou cancelada, o plano nao gera outra.
  const emAberto = await prisma.maintenanceWorkOrder.findFirst({
    where: { planId: plan.id, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELED"] } },
    select: { number: true, scheduledDate: true },
    orderBy: { createdAt: "desc" },
  });
  if (emAberto) {
    const quando = emAberto.scheduledDate ? ` (programada para ${emAberto.scheduledDate.toLocaleDateString("pt-BR")})` : "";
    throw new ValidationError(`A OS ${emAberto.number}${quando} deste plano ainda esta aberta. Conclua ou cancele antes de gerar outra.`);
  }

  // Gerar a mao antes da antecedencia configurada tira o sentido da configuracao: a OS
  // nasceria muito antes da hora e ficaria ocupando a fila. Quem quiser antecipar de
  // proposito passa `forcar`, e a decisao fica explicita.
  if (!opcoes.automatica && !opcoes.forcar && plan.triggerType === "TIME" && plan.nextDueDate) {
    const geracao = computeGenerationDate(plan.nextDueDate, plan.generateAdvanceDays);
    if (geracao && geracao > new Date()) {
      throw new ValidationError(
        `Este plano gera a OS a partir de ${geracao.toLocaleDateString("pt-BR")} (vencimento em ${plan.nextDueDate.toLocaleDateString("pt-BR")}). Para antecipar assim mesmo, confirme a geracao forcada.`,
      );
    }
  }

  /**
   * Material antes de criar a OS: a politica do plano pode ate impedir a geracao, entao
   * a disponibilidade e' checada aqui. Para cada item previsto tenta o principal e, se
   * faltar, o substituto - e guarda o motivo quando nenhum dos dois da.
   */
  const planoDeMaterial: {
    partId: string;
    sparePartId: string;
    quantity: number;
    required: boolean;
    reason: string | null;
  }[] = [];

  for (const part of plan.parts) {
    const candidatos = [part.sparePartId, part.alternativeSparePartId].filter(Boolean) as string[];
    let escolhido: string | null = null;
    let motivo: string | null = null;

    for (const id of candidatos) {
      const peca = await prisma.sparePart.findFirst({
        where: { id, deletedAt: null },
        select: { id: true, name: true, stockQty: true, reservedQty: true, active: true },
      });
      if (!peca) {
        motivo = "Peca nao encontrada no almoxarifado.";
        continue;
      }
      if (!peca.active) {
        motivo = `Peca "${peca.name}" esta inativa.`;
        continue;
      }
      const disponivel = peca.stockQty - peca.reservedQty;
      if (disponivel < part.quantity) {
        motivo = `Saldo insuficiente de "${peca.name}": precisa de ${part.quantity}, disponivel ${disponivel}.`;
        continue;
      }
      escolhido = peca.id;
      motivo = id === part.alternativeSparePartId ? "Reservado o substituto - o principal estava sem saldo." : null;
      break;
    }

    planoDeMaterial.push({
      partId: part.id,
      sparePartId: escolhido ?? part.sparePartId,
      quantity: part.quantity,
      required: part.required,
      reason: escolhido ? motivo : (motivo ?? "Sem saldo disponivel."),
    });
    if (!escolhido) planoDeMaterial[planoDeMaterial.length - 1].sparePartId = part.sparePartId;
  }

  const faltamObrigatorios = planoDeMaterial.filter(
    (m) => m.required && m.reason != null && !m.reason.startsWith("Reservado o substituto"),
  );

  // "Nao gerar" e' a unica politica que recusa - e diz exatamente o que falta, em vez de
  // falhar em silencio.
  if (plan.materialPolicy === "DO_NOT_GENERATE" && faltamObrigatorios.length > 0) {
    throw new ValidationError(
      `OS nao gerada por falta de material obrigatorio: ${faltamObrigatorios.map((m) => m.reason).join(" ")}`,
    );
  }

  const number = await nextClientMaintenanceOrderNumber(plan.clientId);

  // Falta material obrigatorio e a politica manda segurar? A OS ja nasce em "Aguardando
  // material", em vez de entrar na fila como se estivesse pronta para executar.
  const statusInicial =
    plan.materialPolicy === "BLOCK_AWAITING_MATERIAL" && faltamObrigatorios.length > 0
      ? "AWAITING_MATERIAL"
      : plan.initialWorkOrderStatus;

  const observacoesDeGeracao = [
    plan.requiresShutdown
      ? `Requer parada de maquina${plan.estimatedShutdownHours ? ` (~${plan.estimatedShutdownHours}h)` : ""}.`
      : null,
    plan.requiresOperationalRelease ? "Requer liberacao operacional." : null,
    plan.requiresLoto ? "Requer bloqueio/LOTO ou permissao de trabalho." : null,
    plan.requiresApproval ? "Requer aprovacao antes da execucao." : null,
    faltamObrigatorios.length > 0 ? `Material pendente: ${faltamObrigatorios.map((m) => m.reason).join(" ")}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const workOrder = await prisma.maintenanceWorkOrder.create({
    data: {
      number,
      clientId: plan.clientId,
      instrumentId: plan.instrumentId,
      planId: plan.id,
      type: "PREVENTIVE",
      status: statusInicial,
      priority: plan.defaultPriority,
      title: plan.name,
      description: plan.instructions?.trim() || plan.name,
      // Rateio: cai no centro de custo do ativo, como qualquer outra OS dele.
      costCenterId: plan.instrument?.costCenterId ?? null,
      technicianId: plan.responsibleId,
      // Data programada sugerida: o vencimento do ciclo que esta sendo atendido.
      scheduledDate: plan.nextDueDate,
      meterReadingAtExecution: plan.meter?.currentValue,
      // Estimativa do plano e' previsao, nao apontamento: laborHours guarda o que foi de
      // fato trabalhado e nasce vazio (antes ele ja vinha preenchido com a estimativa, o
      // que dava a OS por executada antes de alguem encostar nela).
      estimatedHours: plan.estimatedLaborHours,
      observations: observacoesDeGeracao || null,
      createdById: opcoes.userId,
      // O item da OS leva a regra junto (tipo de resposta, faixa, foto): se o plano for
      // editado depois, a OS ja executada continua contando a historia que valia na epoca.
      checklist: {
        create: plan.checklistTemplate.map((c, i) => ({
          description: c.description,
          sortOrder: i,
          section: c.section,
          required: c.required,
          responseType: c.responseType,
          unit: c.unit,
          minValue: c.minValue,
          maxValue: c.maxValue,
          targetValue: c.targetValue,
          requiresPhoto: c.requiresPhoto,
          estimatedMinutes: c.estimatedMinutes,
          reference: c.reference,
        })),
      },
    },
  });

  await prisma.maintenancePlan.update({
    where: { id: plan.id },
    data: {
      lastGeneratedAt: new Date(),
      lastMeterAtGeneration: plan.meter?.currentValue,
      // O proximo ciclo conta a partir do vencimento que acabou de ser atendido (nao de
      // hoje): plano atrasado nao empurra o calendario inteiro para frente.
      baseDate: plan.nextDueDate ?? new Date(),
      nextDueDate:
        plan.triggerType === "TIME" && plan.frequencyEvery
          ? computeNextDue(plan.nextDueDate ?? new Date(), scheduleConfigOf(plan))
          : plan.nextDueDate,
    },
  });

  // Reserva conforme a politica do plano. ALERT_ONLY gera sem reservar; as demais tentam
  // reservar. Em todos os casos fica registrado o que foi (ou nao foi) reservado e por que -
  // o planejador nao descobre a falta so na hora da execucao.
  const reservaAtiva = plan.materialPolicy !== "ALERT_ONLY";
  for (const item of planoDeMaterial) {
    let reservou = false;
    let motivo = item.reason;

    if (reservaAtiva && (motivo == null || motivo.startsWith("Reservado o substituto"))) {
      try {
        await reserveSparePart({
          sparePartId: item.sparePartId,
          workOrderId: workOrder.id,
          quantity: item.quantity,
          createdById: opcoes.userId,
        });
        reservou = true;
      } catch (erro) {
        motivo = erro instanceof Error ? erro.message : "Falha ao reservar.";
      }
    } else if (!reservaAtiva) {
      motivo = "Politica do plano: gerar sem reservar, com alerta.";
    }

    await prisma.workOrderMaterialLog.create({
      data: {
        workOrderId: workOrder.id,
        sparePartId: item.sparePartId,
        quantityNeeded: item.quantity,
        reserved: reservou,
        reason: reservou && !motivo ? null : motivo,
      },
    });
  }

  await writeAuditLog({
    userId: opcoes.userId,
    action: "CREATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} gerada a partir do plano "${plan.name}"`,
  });

  return workOrder;
}


/** Ponto de entrada do disparo automatico - o mesmo caminho do botao, sem HTTP no meio. */
export function criarOsDoPlanoParaAutomacao(planId: string, opcoes: { userId?: string }) {
  return criarOsDoPlano(planId, { ...opcoes, automatica: true });
}

/** Endpoint da rodada de geracao: util para disparar a mao ou por um cron externo. */
export const runPlanGeneration = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  // CLIENT so dispara a rodada da propria empresa; a equipe interna pode rodar tudo.
  const escopo = clientScopeFilter(req);
  const { gerarOsVencidas } = await import("../../lib/planRunner.js");
  const resultado = await gerarOsVencidas({ clientId: escopo.clientId, userId: req.user?.sub });
  res.json(resultado);
});

/**
 * Interruptor da geracao automatica (a rodada periodica, sozinha) - da propria empresa.
 * Quem decide se quer ligado e' o cliente, na tela de Planos preventivos dele; a equipe
 * interna nao mexe nisso pela Gestao. "Rodar agora" continua liberado mesmo com isso
 * pausado: aqui e' so o piloto automatico, nao a geracao em si.
 */
export const getAutomationStatus = asyncHandler(async (req: Request, res: Response) => {
  const clientId = resolveClientId(req, req.query.clientId as string | undefined);
  const { getAutomationSettings } = await import("../../lib/planRunner.js");
  res.json(await getAutomationSettings(clientId));
});

export const updateAutomationStatus = asyncHandler(async (req: Request, res: Response) => {
  const { enabled, clientId: bodyClientId } = z.object({ enabled: z.boolean(), clientId: z.string().uuid().optional() }).parse(req.body);
  const clientId = resolveClientId(req, bodyClientId);
  const { setAutomationEnabled } = await import("../../lib/planRunner.js");
  const settings = await setAutomationEnabled(clientId, enabled, req.user?.sub);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "AutomationSettings",
    entityId: clientId,
    description: `Geracao automatica de OS ${enabled ? "retomada" : "pausada"}`,
  });

  res.json(settings);
});

/** Botao "Gerar OS" do plano. */
export const generateWorkOrderFromPlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { clientId: true },
  });
  if (!plan) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, plan.clientId);

  // ?forcar=true: antecipar de proposito, quando o planejador decide puxar a preventiva.
  const forcar = req.query.forcar === "true" || req.body?.forcar === true;
  const workOrder = await criarOsDoPlano(req.params.id, { userId: req.user?.sub, forcar });
  res.status(201).json(workOrder);
});

/**
 * Indicadores do plano: cumprimento, atraso, HH e custo planejado x realizado, consumo de
 * material e falhas encontradas durante a preventiva. Tudo calculado a partir das OS que o
 * plano gerou - nada guardado em campo separado, que envelheceria.
 */
export const getMaintenancePlanIndicators = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: {
      id: true,
      estimatedLaborHours: true,
      nextDueDate: true,
      lastExecutionAt: true,
      generateAdvanceDays: true,
      triggerType: true,
      baseDate: true,
      frequencyEvery: true,
      frequencyUnit: true,
      dayOfMonth: true,
      toleranceDaysBefore: true,
      toleranceDaysAfter: true,
      operationalCalendar: true,
      parts: { select: { quantity: true, sparePart: { select: { unitCost: true } } } },
    },
  });
  if (!plan) throw new NotFoundError("Plano de manutencao");

  // Custo planejado de UM ciclo, so a parte que tem base real: o material previsto pelo
  // custo unitario vigente de cada peca. Mao de obra planejada ficaria de fora porque o
  // plano guarda a HH prevista, mas nao um valor/hora - e inventar uma taxa media faria o
  // "planejado x realizado" comparar um numero medido com um chute. A HH prevista x
  // realizada continua sendo comparada em horas, logo acima.
  //
  // Peca sem custo unitario cadastrado zera a base: nesse caso devolve null, porque um
  // "R$ 0,00 planejado" ao lado de um custo real faria todo plano parecer estourado.
  const custoPlanejadoPorCiclo = plan.parts.length
    ? plan.parts.reduce<number | null>((soma, p) => {
        if (soma === null) return null;
        const unitario = p.sparePart?.unitCost;
        return unitario == null ? null : soma + unitario * p.quantity;
      }, 0)
    : null;

  const workOrders = await prisma.maintenanceWorkOrder.findMany({
    where: { planId: plan.id, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      scheduledDate: true,
      completedAt: true,
      createdAt: true,
      partsUsed: { select: { quantity: true, unitCost: true, sparePart: { select: { name: true, unit: true } } } },
      laborEntries: { select: { hours: true, hourlyRateSnapshot: true } },
      thirdPartyServices: { select: { cost: true } },
      spawnedWorkOrders: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const concluidas = workOrders.filter((w) => w.status === "COMPLETED" && w.completedAt);
  const noPrazo = concluidas.filter((w) => !w.scheduledDate || (w.completedAt && w.completedAt <= w.scheduledDate));
  const emAberto = workOrders.filter((w) => !["COMPLETED", "CANCELED"].includes(w.status));
  const agora = new Date();
  const atrasadas = emAberto.filter((w) => w.scheduledDate && w.scheduledDate < agora);

  const hhRealizada = concluidas.reduce((soma, w) => soma + w.laborEntries.reduce((t, l) => t + l.hours, 0), 0);
  const custoPecas = concluidas.reduce(
    (soma, w) => soma + w.partsUsed.reduce((t, x) => t + (x.unitCost ?? 0) * x.quantity, 0),
    0,
  );
  const custoMaoDeObra = concluidas.reduce(
    (soma, w) => soma + w.laborEntries.reduce((t, l) => t + (l.hourlyRateSnapshot ?? 0) * l.hours, 0),
    0,
  );
  const custoTerceiros = concluidas.reduce((soma, w) => soma + w.thirdPartyServices.reduce((t, x) => t + x.cost, 0), 0);

  const consumo = new Map<string, { name: string; unit: string; quantity: number }>();
  for (const w of concluidas) {
    for (const x of w.partsUsed) {
      const chave = x.sparePart?.name ?? "Peca";
      const atual = consumo.get(chave) ?? { name: chave, unit: x.sparePart?.unit ?? "un", quantity: 0 };
      atual.quantity += x.quantity;
      consumo.set(chave, atual);
    }
  }

  // Falhas encontradas na preventiva = corretivas que nasceram de anomalia no checklist
  // destas OS. E' o indicador que diz se a preventiva esta pegando problema de verdade.
  const falhasEncontradas = workOrders.reduce((soma, w) => soma + w.spawnedWorkOrders.length, 0);

  res.json({
    lastExecutionAt: plan.lastExecutionAt,
    nextDueDate: plan.nextDueDate,
    nextGenerationDate: plan.nextDueDate ? computeGenerationDate(plan.nextDueDate, plan.generateAdvanceDays) : null,
    nextDueBreakdown: memoriaDeCalculoDoVencimento(plan),
    totals: {
      generated: workOrders.length,
      completed: concluidas.length,
      open: emAberto.length,
      overdue: atrasadas.length,
    },
    // Sem OS concluida nao ha cumprimento - null vira "Dados insuficientes" na tela, em
    // vez de um 0% que pareceria desempenho ruim.
    compliancePct: concluidas.length > 0 ? Math.round((noPrazo.length / concluidas.length) * 100) : null,
    laborHours: {
      planned: plan.estimatedLaborHours != null ? plan.estimatedLaborHours * concluidas.length : null,
      actual: concluidas.length > 0 ? Math.round(hhRealizada * 10) / 10 : null,
    },
    cost: {
      parts: custoPecas,
      labor: custoMaoDeObra,
      thirdParty: custoTerceiros,
      total: custoPecas + custoMaoDeObra + custoTerceiros,
      tracked: concluidas.length > 0,
      // O que sai por execucao (usado sempre, mesmo sem nenhuma OS concluida ainda - e'
      // o numero que responde "quanto custa material para RODAR o plano uma vez").
      plannedPerCycle: custoPlanejadoPorCiclo,
      // O planejado acumulado (por ciclo x OS concluidas) so' faz sentido lado a lado do
      // realizado em pecas - com zero OS concluidas ele sempre daria R$ 0,00 mesmo havendo
      // material previsto, e "R$ 0,00 previsto" ao lado de "R$ 29,00 por execucao" lia como
      // contradicao (achado em reavaliacao). null enquanto nao houver o que comparar.
      planned: custoPlanejadoPorCiclo != null && concluidas.length > 0 ? custoPlanejadoPorCiclo * concluidas.length : null,
      plannedCovers: "material" as const,
    },
    materialUsage: [...consumo.values()].sort((a, b) => b.quantity - a.quantity),
    failuresFound: falhasEncontradas,
    workOrders: workOrders.slice(0, 20).map((w) => ({
      id: w.id,
      number: w.number,
      status: w.status,
      scheduledDate: w.scheduledDate,
      completedAt: w.completedAt,
      createdAt: w.createdAt,
    })),
  });
});

/** Duplica o plano: copia tudo menos codigo, historico e datas de execucao. Nasce como
 * Rascunho, para o usuario ajustar o que muda antes de ativar. */
export const duplicateMaintenancePlan = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const origem = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { checklistTemplate: { orderBy: { sortOrder: "asc" } }, parts: true },
  });
  if (!origem) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, origem.clientId);

  const {
    id: _id,
    code: _code,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    deletedAt: _deletedAt,
    lastGeneratedAt: _lastGeneratedAt,
    lastExecutionAt: _lastExecutionAt,
    lastMeterAtGeneration: _lastMeter,
    checklistTemplate,
    parts,
    ...dados
  } = origem;

  const novoCodigo = await nextClientMaintenancePlanCode(origem.clientId);

  const copia = await prisma.maintenancePlan.create({
    data: {
      ...dados,
      code: novoCodigo,
      name: origem.name + " (copia)",
      status: "DRAFT",
      active: false,
      createdById: req.user?.sub,
      checklistTemplate: { create: checklistTemplate.map(({ id: _i, planId: _p, ...c }) => c) },
      parts: { create: parts.map(({ id: _i, planId: _p, ...x }) => x) },
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "MaintenancePlan",
    entityId: copia.id,
    description: "Plano " + copia.code + " criado como copia de " + (origem.code ?? origem.name),
  });

  res.status(201).json(copia);
});

const atribuirAtivosSchema = z.object({
  instrumentIds: z.array(z.string().uuid()).min(1, "Escolha pelo menos um ativo."),
});

/**
 * Atribui o plano a um ou mais ativos, depois de criado sem nenhum.
 *
 * O primeiro ativo vira o instrumentId deste plano; cada ativo a mais gera uma copia
 * completa (mesma configuracao, checklist e pecas) - e' o mesmo "um plano de verdade por
 * ativo" que ja vale na criacao com familia, so que como um passo separado, depois que o
 * plano ja existe.
 */
export const atribuirAtivosAoPlano = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { instrumentIds } = atribuirAtivosSchema.parse(req.body);

  const origem = await prisma.maintenancePlan.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { checklistTemplate: { orderBy: { sortOrder: "asc" } }, parts: true },
  });
  if (!origem) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, origem.clientId);

  const instrumentos = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds }, deletedAt: null },
    select: { id: true, clientId: true },
  });
  if (instrumentos.length !== new Set(instrumentIds).size) throw new NotFoundError("Ativo");
  if (instrumentos.some((i) => i.clientId !== origem.clientId)) {
    throw new ValidationError("Um dos ativos escolhidos pertence a outra empresa.");
  }

  const [primeiro, ...resto] = instrumentIds;

  const planoAtualizado = await prisma.maintenancePlan.update({
    where: { id: origem.id },
    data: { instrumentId: primeiro },
    include: detailInclude,
  });
  await sincronizarPeriodicidadeDeCalibracao(planoAtualizado.id);
  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenancePlan",
    entityId: planoAtualizado.id,
    description: `Plano ${planoAtualizado.code ?? planoAtualizado.name} atribuido a um ativo`,
  });

  const planos = [planoAtualizado];
  for (const instrumentId of resto) {
    const {
      id: _id,
      code: _code,
      instrumentId: _instrumentId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      deletedAt: _deletedAt,
      lastGeneratedAt: _lastGeneratedAt,
      lastExecutionAt: _lastExecutionAt,
      lastMeterAtGeneration: _lastMeter,
      checklistTemplate,
      parts,
      ...dados
    } = origem;
    const novoCodigo = await nextClientMaintenancePlanCode(origem.clientId);
    const copia = await prisma.maintenancePlan.create({
      data: {
        ...dados,
        code: novoCodigo,
        instrumentId,
        createdById: req.user?.sub,
        checklistTemplate: { create: checklistTemplate.map(({ id: _i, planId: _p, ...c }) => c) },
        parts: { create: parts.map(({ id: _i, planId: _p, ...x }) => x) },
      },
      include: detailInclude,
    });
    await sincronizarPeriodicidadeDeCalibracao(copia.id);
    await writeAuditLog({
      userId: req.user?.sub,
      action: "CREATE",
      entityType: "MaintenancePlan",
      entityId: copia.id,
      description: `Plano ${copia.code} criado a partir de ${origem.code ?? origem.name} para outro ativo da atribuicao`,
    });
    planos.push(copia);
  }

  res.status(201).json({ planos: planos.map(withDerivedStatus) });
});

// ---------------------------------------------------------------------------
// Anexos do plano: procedimento, ficha tecnica, foto de referencia - opcional, e' o que
// acompanha o passo 3 do cadastro (mesma tabela generica de anexos usada no ativo e na OS).
// ---------------------------------------------------------------------------

async function assertPlanAcessivel(req: Request, planId: string) {
  const plan = await prisma.maintenancePlan.findFirst({ where: { id: planId, deletedAt: null }, select: { id: true, clientId: true } });
  if (!plan) throw new NotFoundError("Plano de manutencao");
  assertOwnClient(req, plan.clientId);
  return plan;
}

export const listMaintenancePlanAttachments = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await assertPlanAcessivel(req, req.params.id);
  const attachments = await prisma.attachment.findMany({
    where: { entityType: "MAINTENANCE_PLAN", entityId: plan.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  res.json(attachments);
});

export const uploadMaintenancePlanAttachment = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await assertPlanAcessivel(req, req.params.id);

  const file = req.file;
  if (!file) throw new ValidationError("Selecione um arquivo.");
  const { category, caption } = req.body as { category?: AttachmentCategory; caption?: string };

  const key = `maintenance-plans/${plan.id}/${Date.now()}-${file.originalname}`;
  await getStorageProvider().upload(key, file.buffer, file.mimetype);

  const attachment = await prisma.attachment.create({
    data: {
      entityType: "MAINTENANCE_PLAN",
      entityId: plan.id,
      category: category && ["LOCATION", "INSTRUMENT", "STANDARD", "MEASUREMENT", "DOCUMENT", "OTHER"].includes(category) ? category : "OTHER",
      caption: caption || null,
      fileKey: key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: req.user?.sub,
    },
  });

  res.status(201).json(attachment);
});

export const deleteMaintenancePlanAttachment = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await assertPlanAcessivel(req, req.params.id);

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "MAINTENANCE_PLAN", entityId: plan.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  await getStorageProvider().delete(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });

  res.status(204).send();
});

export const getMaintenancePlanAttachmentUrl = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const plan = await assertPlanAcessivel(req, req.params.id);

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "MAINTENANCE_PLAN", entityId: plan.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  const url = await getStorageProvider().getSignedDownloadUrl(attachment.fileKey, attachment.fileName);
  res.json({ url });
});
