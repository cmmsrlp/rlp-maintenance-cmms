import type { Request, Response } from "express";
import { z } from "zod";
import { dataOpcional, dataObrigatoria } from "../../utils/zod";
import { BreakdownSituation, MaintenanceOrderType, MaintenancePriority, MaintenanceOrderStatus, ChecklistItemResult, AttachmentCategory, LaborHourType, FailureSeverity, CorrectiveType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, assertServiceAccess, assertOwnClient, resolveClientId, resolveClientScope } from "../../middleware/rbac";
import { nextClientMaintenanceOrderNumber } from "../../utils/sequence";
import { applySparePartMovement, reserveSparePart, releaseSparePartReservation, consumeSparePartReservation } from "../../lib/inventory";
import { getStorageProvider } from "../../lib/storage";
import { recalcularCriticidade } from "../../lib/assetCriticality";

const pecaResumo = {
  select: { id: true, name: true, code: true, unit: true, stockQty: true, reservedQty: true, minStock: true, unitCost: true },
} as const;

const materialLogInclude = {
  sparePart: pecaResumo,
  alternativeSparePart: pecaResumo,
} as const;

const detailInclude = {
  client: { select: { id: true, companyName: true, tradeName: true } },
  instrument: { select: { id: true, type: true, model: true, serialNumber: true, tag: true } },
  // Vinculo duplo: instrument acima e' o local funcional, isto e' a unidade fisica
  // (motor, redutor...) que apresentou a falha, quando o ativo tem uma instalada.
  rotableEquipment: { select: { id: true, code: true, type: true, manufacturer: true, model: true, serialNumber: true, status: true } },
  plan: { select: { id: true, name: true } },
  technician: { select: { id: true, name: true } },
  assignedResource: { select: { id: true, name: true, type: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  approvedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  failureCode: true,
  checklist: { orderBy: { sortOrder: "asc" as const } },
  // Rastreabilidade fim-a-fim: de onde esta OS veio (SS que a originou, ou OS preventiva
  // + item de checklist que revelou a anomalia) e o que ela gerou (corretivas abertas
  // automaticamente por anomalias encontradas no proprio checklist).
  serviceRequest: { select: { id: true, number: true, status: true } },
  originWorkOrder: { select: { id: true, number: true, type: true } },
  originChecklistItem: { select: { id: true, description: true } },
  spawnedWorkOrders: { select: { id: true, number: true, status: true, type: true }, orderBy: { createdAt: "asc" as const } },
  // Equipe de apoio (o responsavel e' o assignedResource logo acima).
  assignees: { include: { laborResource: { select: { id: true, name: true, type: true } } }, orderBy: { createdAt: "asc" as const } },
  partsUsed: { include: { sparePart: { select: { id: true, name: true, code: true, unit: true } } } },
  laborEntries: { include: { laborResource: { select: { id: true, name: true, type: true } } }, orderBy: { createdAt: "asc" as const } },
  thirdPartyServices: { orderBy: { createdAt: "asc" as const } },
  partReservations: {
    where: { status: "RESERVED" as const },
    include: { sparePart: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  stoppages: { include: { reason: { select: { id: true, name: true } } }, orderBy: { startedAt: "asc" as const } },
  // Material previsto da OS (o que ela precisa), com substituto e fornecedor sugerido.
  materialLogs: { include: materialLogInclude, orderBy: { createdAt: "asc" as const } },
  // Investigacoes abertas a partir da falha registrada nesta OS.
  rootCauseAnalyses: { where: { deletedAt: null }, select: { id: true, status: true }, orderBy: { createdAt: "desc" as const } },
};


/** O ativo mais tudo que esta abaixo dele na arvore. Vai ate 20 niveis - ciclo ja e'
 * barrado na escrita, o limite aqui e' so para nunca travar a listagem. */
async function idsDoAtivoEDescendentes(instrumentId: string): Promise<string[]> {
  const todos = [instrumentId];
  let camada = [instrumentId];
  for (let nivel = 0; nivel < 20 && camada.length > 0; nivel += 1) {
    const filhos = await prisma.instrument.findMany({
      where: { parentId: { in: camada }, deletedAt: null },
      select: { id: true },
    });
    camada = filhos.map((f) => f.id);
    todos.push(...camada);
  }
  return todos;
}

export const listMaintenanceWorkOrders = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, instrumentId, planId, status, type, technicianId, search, incluirComponentes } = req.query as {
    clientId?: string;
    instrumentId?: string;
    planId?: string;
    status?: MaintenanceOrderStatus;
    type?: MaintenanceOrderType;
    technicianId?: string;
    search?: string;
    incluirComponentes?: string;
  };

  // A ficha de uma LINHA quase nao tem ordem propria - o servico acontece nas maquinas
  // abaixo dela. Sem isso a tela dizia "nenhuma ordem" numa linha com dezenas delas no
  // galho, que e' o oposto do que quem abre a ficha quer saber.
  const idsDoGalho =
    instrumentId && incluirComponentes === "true" ? await idsDoAtivoEDescendentes(instrumentId) : null;

  const where = {
    deletedAt: null,
    ...resolveClientScope(req, clientId),
    ...(idsDoGalho ? { instrumentId: { in: idsDoGalho } } : instrumentId ? { instrumentId } : {}),
    ...(planId ? { planId } : {}),
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(technicianId ? { technicianId } : {}),
    ...(search ? { number: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.maintenanceWorkOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        instrument: { select: { id: true, type: true, model: true, serialNumber: true, tag: true } },
        technician: { select: { id: true, name: true } },
        // O planejamento e a programacao mostram quem esta com a OS - sem isso o cartao
        // dizia "sem responsavel" mesmo com assignedResourceId preenchido, porque so o id
        // vinha e o nome nao.
        assignedResource: { select: { id: true, name: true, type: true } },
      },
    }),
    prisma.maintenanceWorkOrder.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});

export const getMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: detailInclude,
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  res.json({ ...workOrder, materialSummary: resumirMaterial(workOrder) });
});

/**
 * Resumo de material da OS: previsto, reservado, consumido, saldo e o que falta, com custo
 * previsto x realizado.
 *
 * Cada numero sai de uma fonte diferente e antes so existiam espalhados pela tela: o
 * previsto no plano, o reservado nas reservas, o consumido nos movimentos. Quem precisava
 * saber "posso executar esta OS amanha?" tinha que somar de cabeca.
 */
function resumirMaterial(workOrder: {
  materialLogs: { sparePartId: string; quantityNeeded: number; required: boolean; sparePart: { name: string; unit: string; stockQty: number; reservedQty: number; minStock: number; unitCost: number | null } }[];
  partReservations: { sparePartId: string; quantity: number }[];
  partsUsed: { sparePartId: string; quantity: number; unitCost: number | null }[];
}) {
  const reservadoPorPeca = new Map<string, number>();
  for (const r of workOrder.partReservations) {
    reservadoPorPeca.set(r.sparePartId, (reservadoPorPeca.get(r.sparePartId) ?? 0) + r.quantity);
  }
  const consumidoPorPeca = new Map<string, number>();
  for (const m of workOrder.partsUsed) {
    consumidoPorPeca.set(m.sparePartId, (consumidoPorPeca.get(m.sparePartId) ?? 0) + m.quantity);
  }

  const itens = workOrder.materialLogs.map((log) => {
    const reservado = reservadoPorPeca.get(log.sparePartId) ?? 0;
    const consumido = consumidoPorPeca.get(log.sparePartId) ?? 0;
    // Disponivel para ESTA OS: o saldo livre do almoxarifado mais o que ja esta reservado
    // para ela - o proprio reservado nao pode contar como falta.
    const livreNoAlmoxarifado = log.sparePart.stockQty - log.sparePart.reservedQty;
    const cobertura = reservado + consumido;
    const falta = Math.max(0, log.quantityNeeded - cobertura - Math.max(0, livreNoAlmoxarifado));
    return {
      sparePartId: log.sparePartId,
      nome: log.sparePart.name,
      unidade: log.sparePart.unit,
      obrigatorio: log.required,
      previsto: log.quantityNeeded,
      reservado,
      consumido,
      saldoDisponivel: livreNoAlmoxarifado,
      estoqueMinimo: log.sparePart.minStock,
      abaixoDoMinimo: log.sparePart.stockQty <= log.sparePart.minStock,
      falta,
      custoPrevisto: log.sparePart.unitCost != null ? log.sparePart.unitCost * log.quantityNeeded : null,
    };
  });

  const custoRealizado = workOrder.partsUsed.reduce((soma, m) => soma + (m.unitCost ?? 0) * m.quantity, 0);
  const previstoConhecido = itens.every((i) => i.custoPrevisto != null);

  return {
    itens,
    // Sem custo unitario em alguma peca o previsto ficaria menor que a realidade - melhor
    // dizer que nao da para comparar do que mostrar um numero pela metade.
    custoPrevisto: previstoConhecido ? itens.reduce((soma, i) => soma + (i.custoPrevisto ?? 0), 0) : null,
    custoRealizado,
    faltaObrigatorio: itens.some((i) => i.obrigatorio && i.falta > 0),
    itensEmFalta: itens.filter((i) => i.falta > 0).length,
  };
}

// Operacao do servico: o que fazer e quanto tempo se espera gastar nela.
const checklistItemInput = z.object({
  description: z.string().min(1),
  estimatedMinutes: z.coerce.number().int().nonnegative().nullish(),
});

const workOrderSchema = z.object({
  clientId: z.string().uuid().optional(),
  instrumentId: z.string().uuid(),
  // Vinculo duplo: instrumentId acima e' o local funcional (onde o problema ocorreu);
  // rotableEquipmentId e' a unidade fisica que apresentou a falha (motor, redutor...),
  // quando o ativo tem um equipamento recondicionavel instalado. Opcional porque nem todo
  // ativo tem um rotavel vinculado.
  rotableEquipmentId: z.string().uuid().nullish(),
  type: z.nativeEnum(MaintenanceOrderType),
  // So para corretiva: em operacao (maquina rodando) ou de quebra (maquina parada).
  correctiveType: z.nativeEnum(CorrectiveType).nullish(),
  // So em corretiva de quebra: se ja aconteceu, se esta acontecendo agora ou se sera
  // tratada depois. E' o que decide o que o cadastro pode exigir da janela da falha.
  breakdownSituation: z.nativeEnum(BreakdownSituation).nullish(),
  // Situacao com que a OS nasce. Concluida e Cancelada ficam de fora: concluir tem regras
  // proprias (checklist, registro de falha) e cancelar uma OS no ato de cria-la nao e' um
  // registro, e' um formulario preenchido a toa.
  status: z
    .nativeEnum(MaintenanceOrderStatus)
    .refine((v) => v !== "COMPLETED" && v !== "CANCELED", {
      message: "Uma OS nao nasce concluida nem cancelada - abra e depois mude a situacao.",
    })
    .optional(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  title: z.string().max(200).nullish(),
  description: z.string().min(2, "Descreva o servico."),
  costCenterId: z.string().uuid().nullish(),
  technicianId: z.string().uuid().nullish(),
  assignedResourceId: z.string().uuid().nullish(),
  scheduledDate: dataOpcional,
  plannedStart: dataOpcional,
  plannedEnd: dataOpcional,
  estimatedHours: z.coerce.number().nonnegative().nullish(),
  failureCodeId: z.string().uuid().nullish(),
  laborHours: z.coerce.number().nullish(),
  observations: z.string().nullish(),
  executionNotes: z.string().nullish(),
  closureNotes: z.string().nullish(),
  // Registro de falha - so tem sentido em OS corretiva (validado abaixo).
  failureStartedAt: dataOpcional,
  failureEndedAt: dataOpcional,
  failureSeverity: z.nativeEnum(FailureSeverity).nullish(),
  failureDescription: z.string().nullish(),
  failureRootCause: z.string().nullish(),
  failureCorrectiveAction: z.string().nullish(),
  productionLoss: z.coerce.number().nonnegative().nullish(),
  checklist: z.array(checklistItemInput).optional(),
});

/** Centro de custo da OS tem que ser da mesma empresa. */
async function assertCostCenterBelongsToClient(costCenterId: string | null | undefined, clientId: string) {
  if (!costCenterId) return;
  const cc = await prisma.costCenter.findFirst({ where: { id: costCenterId, deletedAt: null }, select: { clientId: true } });
  if (!cc) throw new NotFoundError("Centro de custo");
  if (cc.clientId !== clientId) throw new ValidationError("Esse centro de custo e' de outra empresa.");
}

/** "Em operacao" ou "de quebra" so existe dentro da corretiva. */
function assertTipoDeCorretivaCoerente(tipo: MaintenanceOrderType | undefined, correctiveType: CorrectiveType | null | undefined) {
  if (correctiveType && tipo && tipo !== "CORRECTIVE") {
    throw new ValidationError("Em operacao / de quebra so se aplica a ordem corretiva.");
  }
}

/** Campos do registro de falha que uma corretiva de quebra precisa ter para ser concluida.
 * A cobranca e' na conclusao, e nao na abertura: na hora em que a maquina para, quem abre a
 * OS quase nunca sabe ainda a gravidade nem quando a producao voltou. */
function faltaNoRegistroDeFalha(os: {
  failureStartedAt: Date | null;
  failureEndedAt: Date | null;
  failureSeverity: FailureSeverity | null;
  failureCodeId: string | null;
  failureDescription: string | null;
}): string[] {
  const falta: string[] = [];
  if (!os.failureStartedAt) falta.push("inicio da falha");
  if (!os.failureEndedAt) falta.push("termino da falha");
  if (!os.failureCodeId) falta.push("categoria da falha");
  if (!os.failureSeverity) falta.push("gravidade");
  if (!os.failureDescription?.trim()) falta.push("descricao da falha");
  return falta;
}

/**
 * O que a quebra permite exigir agora, conforme o momento em que ela chegou.
 *
 * Cobrar inicio E termino em toda quebra obrigava a inventar um horario de termino com a
 * maquina ainda parada - e um MTTR construido sobre chute e' pior do que MTTR nenhum.
 */
function assertSituacaoDaQuebraCoerente(
  correctiveType: CorrectiveType | null | undefined,
  situacao: BreakdownSituation | null | undefined,
  dados: { failureStartedAt?: Date | null; failureEndedAt?: Date | null },
) {
  if (!situacao) return;
  if (correctiveType !== "BREAKDOWN") {
    throw new ValidationError('"Situacao da quebra" so existe em corretiva de quebra.');
  }

  if (situacao === "ALREADY_HAPPENED") {
    if (!dados.failureStartedAt || !dados.failureEndedAt) {
      throw new ValidationError("A quebra ja aconteceu: informe quando a maquina parou e quando voltou.");
    }
  }
  if (situacao === "HAPPENING_NOW") {
    if (!dados.failureStartedAt) {
      throw new ValidationError("A maquina esta parada agora: informe quando ela parou.");
    }
    if (dados.failureEndedAt) {
      throw new ValidationError(
        "A maquina ainda esta parada - o termino da falha e' preenchido quando ela voltar, na conclusao da OS.",
      );
    }
  }
}

/** O registro de falha pertence a corretiva: numa preventiva/preditiva ele nao descreve
 * nada real e sujaria o Pareto de falhas. */
function assertRegistroDeFalhaCoerente(
  tipo: MaintenanceOrderType | undefined,
  dados: {
    failureStartedAt?: Date | null;
    failureEndedAt?: Date | null;
    failureSeverity?: FailureSeverity | null;
    failureDescription?: string | null;
    failureRootCause?: string | null;
    failureCorrectiveAction?: string | null;
    productionLoss?: number | null;
  },
) {
  const preencheu =
    dados.failureStartedAt != null ||
    dados.failureEndedAt != null ||
    dados.failureSeverity != null ||
    !!dados.failureDescription ||
    !!dados.failureRootCause ||
    !!dados.failureCorrectiveAction ||
    dados.productionLoss != null;

  if (preencheu && tipo && tipo !== "CORRECTIVE") {
    throw new ValidationError("O registro de falha so se aplica a ordem corretiva.");
  }
  if (dados.failureStartedAt && dados.failureEndedAt && dados.failureEndedAt < dados.failureStartedAt) {
    throw new ValidationError("O termino da falha nao pode ser antes do inicio da falha.");
  }
}

/** Termino planejado antes do inicio nao e' erro de digitacao aceitavel: vira prazo
 * negativo em qualquer relatorio de aderencia. */
function assertJanelaCoerente(inicio?: Date | null, fim?: Date | null) {
  if (inicio && fim && fim < inicio) {
    throw new ValidationError("O termino planejado nao pode ser antes do inicio planejado.");
  }
}

/** A mao de obra atribuida a OS tem que ser da mesma empresa da OS. */
async function assertResourceBelongsToClient(assignedResourceId: string | null | undefined, clientId: string) {
  if (!assignedResourceId) return;
  const resource = await prisma.laborResource.findFirst({ where: { id: assignedResourceId, deletedAt: null }, select: { clientId: true } });
  if (!resource) throw new NotFoundError("Mao de obra");
  if (resource.clientId !== clientId) throw new ValidationError("Essa mao de obra e' de outra empresa.");
}

/** Um codigo de falha so pode ser usado pela empresa dona dele (ou por qualquer uma,
 * quando faz parte do catalogo padrao da OptiProcess). */
async function assertFailureCodeUsable(failureCodeId: string | null | undefined, clientId: string) {
  if (!failureCodeId) return;
  const code = await prisma.failureCode.findFirst({ where: { id: failureCodeId }, select: { clientId: true } });
  if (!code) throw new NotFoundError("Codigo de falha");
  if (code.clientId && code.clientId !== clientId) {
    throw new ValidationError("Esse codigo de falha e' de outra empresa.");
  }
}

export const createMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = workOrderSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);

  const instrument = await prisma.instrument.findFirst({
    where: { id: data.instrumentId, deletedAt: null },
    select: { clientId: true, costCenterId: true, installedRotables: { where: { status: "INSTALLED", deletedAt: null }, select: { id: true }, take: 1 } },
  });
  if (!instrument) throw new NotFoundError("Ativo");
  if (instrument.clientId !== clientId) throw new ValidationError("Esse ativo pertence a outra empresa.");

  // Vinculo duplo: quando ninguem escolheu explicitamente, a OS ja nasce apontando pro
  // equipamento recondicionavel instalado agora neste ativo (se houver um) - e' o que
  // "apresentou o problema" na maioria dos casos; a troca via /rotable-equipment/substituir
  // pode reapontar isso depois se o diagnostico mudar.
  const rotableEquipmentId =
    data.rotableEquipmentId !== undefined ? data.rotableEquipmentId : instrument.installedRotables[0]?.id ?? null;
  if (rotableEquipmentId) {
    const rotable = await prisma.rotableEquipment.findFirst({ where: { id: rotableEquipmentId, deletedAt: null }, select: { clientId: true } });
    if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
    if (rotable.clientId !== clientId) throw new ValidationError("Esse equipamento recondicionavel pertence a outra empresa.");
  }

  await assertFailureCodeUsable(data.failureCodeId, clientId);
  await assertResourceBelongsToClient(data.assignedResourceId, clientId);
  await assertCostCenterBelongsToClient(data.costCenterId, clientId);
  assertJanelaCoerente(data.plannedStart, data.plannedEnd);
  assertRegistroDeFalhaCoerente(data.type, data);
  assertTipoDeCorretivaCoerente(data.type, data.correctiveType);
  assertSituacaoDaQuebraCoerente(data.correctiveType, data.breakdownSituation, data);
  if (data.type === "CORRECTIVE" && !data.correctiveType) {
    throw new ValidationError("Informe se a corretiva e' em operacao ou de quebra.");
  }

  const number = await nextClientMaintenanceOrderNumber(clientId);
  const { checklist, ...orderData } = data;

  const workOrder = await prisma.maintenanceWorkOrder.create({
    data: {
      ...orderData,
      clientId,
      number,
      rotableEquipmentId,
      // Sem centro de custo informado, a OS herda o do ativo - e' onde o custo cai por
      // padrao. Fica gravado na OS para nao mudar retroativamente se o ativo for movido.
      costCenterId: orderData.costCenterId ?? instrument.costCenterId,
      // Quem abre ja sabe em que pe a OS esta: uma quebra em atendimento nasce Liberada,
      // uma que espera peca nasce Aguardando material. "Aberta" continua o padrao.
      status: orderData.status ?? "OPEN",
      createdById: req.user?.sub,
      checklist: { create: (checklist ?? []).map((c, i) => ({ description: c.description, estimatedMinutes: c.estimatedMinutes ?? null, sortOrder: i })) },
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} criada`,
  });

  res.status(201).json(workOrder);
});

const updateSchema = workOrderSchema.partial().extend({ status: z.nativeEnum(MaintenanceOrderStatus).optional() });

export const updateMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);

  await assertFailureCodeUsable(data.failureCodeId, existing.clientId);
  await assertResourceBelongsToClient(data.assignedResourceId, existing.clientId);
  await assertCostCenterBelongsToClient(data.costCenterId, existing.clientId);
  assertJanelaCoerente(data.plannedStart ?? existing.plannedStart, data.plannedEnd ?? existing.plannedEnd);
  assertTipoDeCorretivaCoerente(data.type ?? existing.type, data.correctiveType ?? existing.correctiveType);
  assertRegistroDeFalhaCoerente(data.type ?? existing.type, {
    failureStartedAt: data.failureStartedAt ?? existing.failureStartedAt,
    failureEndedAt: data.failureEndedAt ?? existing.failureEndedAt,
    failureSeverity: data.failureSeverity ?? existing.failureSeverity,
    failureDescription: data.failureDescription ?? existing.failureDescription,
    failureRootCause: data.failureRootCause ?? existing.failureRootCause,
    failureCorrectiveAction: data.failureCorrectiveAction ?? existing.failureCorrectiveAction,
    productionLoss: data.productionLoss ?? existing.productionLoss,
  });

  const { checklist, ...orderData } = data;
  if (req.user?.role === "CLIENT") delete orderData.clientId;
  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: orderData,
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} atualizada`,
  });

  res.json(workOrder);
});

/**
 * Remover uma OS apaga o historico do ativo - as horas lancadas, o material consumido, a
 * falha registrada. Quem quer parar uma OS que nao sera feita CANCELA: o registro fica,
 * com o motivo, e os indicadores continuam contando a mesma realidade.
 *
 * A rota continua existindo so para a OptiProcess limpar dado de teste; a equipe do
 * cliente nao alcanca (e o botao saiu da tela).
 */
export const deleteMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);

  await prisma.maintenanceWorkOrder.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "MaintenanceWorkOrder",
    entityId: existing.id,
    description: `OS ${existing.number} removida`,
  });

  res.status(204).send();
});

/**
 * O proprio mantenedor assume a OS.
 *
 * Sao dois caminhos ate a OS chegar em alguem, e a manutencao usa os dois: o planejador
 * atribui (quando ele distribui a carga da semana) ou o mantenedor pega a OS da fila
 * (quando ele esta livre e escolhe o que fazer). Ate aqui so o primeiro existia, e a OS
 * ficava parada esperando alguem lembrar de distribuir.
 *
 * Assumir NAO inicia a OS: sao coisas diferentes, e misturar as duas acabaria com o MTTR
 * (que conta do inicio a conclusao) medindo o tempo desde que alguem clicou por engano.
 */
export const claimMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);
  if (["COMPLETED", "CANCELED"].includes(existing.status)) {
    throw new ValidationError("Esta OS ja foi encerrada.");
  }

  // Quem assume e' a PESSOA da mao de obra, nao o login: e' ela que aparece na programacao
  // e que carrega o valor/hora. A ligacao entre as duas e' o campo userId.
  const eu = await prisma.laborResource.findFirst({
    where: { userId: req.user?.sub, deletedAt: null, active: true },
    select: { id: true, name: true },
  });
  if (!eu) {
    throw new ValidationError(
      "Seu acesso ainda nao esta ligado a um cadastro de mao de obra. Peca ao planejador para fazer essa ligacao em Mao de obra - sem ela o sistema nao sabe quem esta assumindo.",
    );
  }

  if (existing.assignedResourceId && existing.assignedResourceId !== eu.id) {
    const dono = await prisma.laborResource.findFirst({ where: { id: existing.assignedResourceId }, select: { name: true } });
    throw new ValidationError(
      `Esta OS ja esta com ${dono?.name ?? "outra pessoa"}. Se for para trocar, quem planeja faz a reatribuicao.`,
    );
  }

  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: { assignedResourceId: eu.id },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} assumida por ${eu.name}`,
  });

  res.json(workOrder);
});

/** Quem planeja distribui a OS - o outro caminho, usado quando a carga da semana e' dividida. */
export const assignMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { assignedResourceId } = z
    .object({ assignedResourceId: z.string().uuid().nullable() })
    .parse(req.body);

  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);

  if (assignedResourceId) {
    const recurso = await prisma.laborResource.findFirst({
      where: { id: assignedResourceId, deletedAt: null, clientId: existing.clientId },
      select: { id: true, name: true, active: true },
    });
    if (!recurso) throw new ValidationError("Esta pessoa nao esta na mao de obra da sua empresa.");
    if (!recurso.active) throw new ValidationError(`${recurso.name} esta inativo na mao de obra.`);
  }

  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: { assignedResourceId },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: assignedResourceId
      ? `OS ${workOrder.number} atribuida a ${workOrder.assignedResource?.name ?? "-"}`
      : `OS ${workOrder.number} ficou sem responsavel`,
  });

  res.json(workOrder);
});

/**
 * Libera a OS para execucao - e quem libera fica com ela.
 *
 * Liberar e iniciar sao coisas diferentes: liberar e' dizer "pode fazer" (a maquina esta
 * disponivel, o material chegou, a parada foi autorizada); iniciar e' a ferramenta na mao,
 * e e' dele que sai o MTTR. Antes so existia iniciar, entao a OS pulava da fila direto
 * para "em execucao" e ninguem sabia dizer quem tinha autorizado.
 *
 * Quem libera assume, se a OS ainda nao tem dono - na pratica quem libera e' quem vai
 * fazer, ou quem esta entregando para alguem. Trocar depois continua sendo do planejador.
 */
export const releaseMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);
  if (["COMPLETED", "CANCELED"].includes(existing.status)) throw new ValidationError("Esta OS ja foi encerrada.");
  if (existing.startedAt) throw new ValidationError("Esta OS ja foi iniciada.");

  // Quem clicou, se estiver ligado a um cadastro de mao de obra. Sem ligacao nao e' erro:
  // a OS e' liberada do mesmo jeito, so continua sem dono definido.
  const eu = await prisma.laborResource.findFirst({
    where: { userId: req.user?.sub, deletedAt: null, active: true },
    select: { id: true, name: true },
  });

  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: {
      status: "RELEASED",
      ...(existing.assignedResourceId || !eu ? {} : { assignedResourceId: eu.id }),
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} liberada${!existing.assignedResourceId && eu ? ` e assumida por ${eu.name}` : ""}`,
  });

  res.json(workOrder);
});

export const startMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);
  if (existing.startedAt) throw new ValidationError("Ordem de manutencao ja foi iniciada.");

  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: { startedAt: new Date(), status: "IN_PROGRESS" },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} iniciada`,
  });

  res.json(workOrder);
});

export const completeMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { checklist: true },
  });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);
  if (existing.checklist.some((c) => c.result === "PENDING")) {
    throw new ValidationError("Resolva todos os itens do checklist antes de concluir a ordem.");
  }

  // Toda corretiva concluida diz o que foi: intervencao com a maquina rodando ou quebra.
  // Sem isso nao da pra separar o que parou producao do que nao parou.
  if (existing.type === "CORRECTIVE" && !existing.correctiveType) {
    throw new ValidationError("Informe se esta corretiva foi em operacao ou de quebra antes de concluir.");
  }

  // Quebra sem registro de falha nao fecha: e' o unico momento em que alguem ainda sabe
  // quando parou, quanto tempo ficou parada e por que. Depois de fechada, ninguem lembra -
  // e o Pareto de falhas passa a mentir por omissao.
  if (existing.correctiveType === "BREAKDOWN") {
    const falta = faltaNoRegistroDeFalha(existing);
    if (falta.length > 0) {
      throw new ValidationError(`Corretiva de quebra: preencha o registro da falha antes de concluir (falta: ${falta.join(", ")}).`);
    }
  }

  const { meterReadingAtExecution, closureNotes } = z
    .object({ meterReadingAtExecution: z.coerce.number().nullish(), closureNotes: z.string().nullish() })
    .parse(req.body ?? {});

  const agora = new Date();
  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: {
      completedAt: agora,
      status: "COMPLETED",
      startedAt: existing.startedAt ?? agora,
      // Quem encerrou e quando - a OS deixa de depender do log de auditoria para responder
      // "quem fechou isso?".
      closedById: req.user?.sub,
      closedAt: agora,
      ...(closureNotes != null ? { closureNotes } : {}),
      ...(meterReadingAtExecution != null ? { meterReadingAtExecution } : {}),
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} concluida`,
  });

  // Plano so sabe que foi executado de verdade quando a OS dele conclui - "ultima
  // geracao" nao e' a mesma coisa que "ultima execucao".
  if (workOrder.planId) {
    await prisma.maintenancePlan.update({
      where: { id: workOrder.planId },
      data: { lastExecutionAt: workOrder.completedAt ?? new Date() },
    });
  }

  // Se a OS veio de uma Solicitacao de Servico, a conclusao da OS fecha a solicitacao -
  // e' o "conclusao da OS atualiza a SS" do fluxo pedido.
  await prisma.serviceRequest.updateMany({
    where: { workOrderId: workOrder.id, status: { notIn: ["CLOSED", "REJECTED"] } },
    data: { status: "CLOSED" },
  });

  // Falha funcional concluida muda o historico de falha do local - a nota de Q (Criticidade
  // de ativos) recalcula na hora, sem esperar alguem abrir aquela tela.
  if (workOrder.type === "CORRECTIVE" && workOrder.correctiveType === "BREAKDOWN") {
    await recalcularCriticidade(workOrder.instrumentId, "OS_CLOSED_WITH_FAILURE");
  }

  res.json(workOrder);
});

const checklistUpdateSchema = z.object({
  result: z.nativeEnum(ChecklistItemResult).optional(),
  notes: z.string().nullish(),
  // Preenchimento conforme o tipo de resposta do item.
  numericValue: z.coerce.number().nullish(),
  textValue: z.string().nullish(),
});

export const updateChecklistItem = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true, number: true, clientId: true, instrumentId: true, createdById: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const data = checklistUpdateSchema.parse(req.body);
  const item = await prisma.maintenanceWorkOrderChecklistItem.findFirst({
    where: { id: req.params.itemId, workOrderId: workOrder.id },
  });
  if (!item) throw new NotFoundError("Item do checklist");

  // Medicao fora da faixa e' anomalia do mesmo jeito que marcar "Nao OK" - senao o
  // ponto sairia da faixa e ninguem abriria corretiva.
  let dadosFinais = { ...data };
  if (data.numericValue != null && item.responseType === "NUMBER") {
    const foraDaFaixa =
      (item.minValue != null && data.numericValue < item.minValue) ||
      (item.maxValue != null && data.numericValue > item.maxValue);
    dadosFinais = { ...dadosFinais, result: foraDaFaixa ? "NOT_OK" : "OK" };
  }

  const updated = await prisma.maintenanceWorkOrderChecklistItem.update({ where: { id: item.id }, data: dadosFinais });

  // Anomalia encontrada na inspecao: abre corretiva automaticamente, vinculada a OS e ao
  // item que revelou o problema - melhor esforco, no maximo uma corretiva por item (a
  // unique constraint em originChecklistItemId garante isso mesmo marcando NOT_OK de novo).
  let spawnedWorkOrder: { id: string; number: string } | null = null;
  if (updated.result === "NOT_OK") {
    const alreadySpawned = await prisma.maintenanceWorkOrder.findFirst({
      where: { originChecklistItemId: item.id },
      select: { id: true, number: true },
    });
    if (alreadySpawned) {
      spawnedWorkOrder = alreadySpawned;
    } else {
      const number = await nextClientMaintenanceOrderNumber(workOrder.clientId);
      const medicao =
        updated.responseType === "NUMBER" && updated.numericValue != null
          ? ` (medido ${updated.numericValue}${updated.unit ? ` ${updated.unit}` : ""}` +
            `${updated.minValue != null || updated.maxValue != null ? `, faixa ${updated.minValue ?? "-"} a ${updated.maxValue ?? "-"}` : ""})`
          : "";
      const description = `Anomalia identificada na inspecao da OS ${workOrder.number}: "${updated.description}"${medicao}${updated.notes ? ` - ${updated.notes}` : ""}`;
      const corrective = await prisma.maintenanceWorkOrder.create({
        data: {
          number,
          clientId: workOrder.clientId,
          instrumentId: workOrder.instrumentId,
          type: "CORRECTIVE",
          // A anomalia foi vista numa inspecao, com o equipamento em uso - nao e' uma
          // quebra. Quem atender pode reclassificar se encontrar a maquina parada.
          correctiveType: "IN_OPERATION",
          status: "OPEN",
          priority: "HIGH",
          description,
          originWorkOrderId: workOrder.id,
          originChecklistItemId: item.id,
          createdById: req.user?.sub,
        },
        select: { id: true, number: true },
      });
      spawnedWorkOrder = corrective;

      await writeAuditLog({
        userId: req.user?.sub,
        action: "CREATE",
        entityType: "MaintenanceWorkOrder",
        entityId: corrective.id,
        description: `OS ${corrective.number} aberta automaticamente por anomalia no checklist da OS ${workOrder.number}`,
      });
    }
  }

  res.json({ item: updated, spawnedWorkOrder });
});

const partSchema = z.object({
  sparePartId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
  reason: z.string().nullish(),
});

export const addWorkOrderPart = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = partSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const sparePart = await prisma.sparePart.findFirst({ where: { id: data.sparePartId, deletedAt: null } });
  if (!sparePart) throw new NotFoundError("Peca do almoxarifado");
  if (sparePart.clientId !== workOrder.clientId) {
    throw new ValidationError("Essa peca e' do almoxarifado de outra empresa.");
  }

  const movement = await applySparePartMovement({
    sparePartId: data.sparePartId,
    type: "OUT",
    quantity: data.quantity,
    reason: data.reason ?? `Consumido na OS ${workOrder.number}`,
    maintenanceWorkOrderId: workOrder.id,
    createdById: req.user?.sub,
  });

  res.status(201).json(movement);
});

export const removeWorkOrderPart = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const movement = await prisma.sparePartMovement.findFirst({
    where: { id: req.params.movementId, maintenanceWorkOrderId: workOrder.id },
  });
  if (!movement) throw new NotFoundError("Movimentacao");

  // Estorna a baixa de estoque (devolve a quantidade) e remove o registro.
  await applySparePartMovement({
    sparePartId: movement.sparePartId,
    type: "IN",
    quantity: movement.quantity,
    reason: "Estorno de peca removida da OS",
  });
  await prisma.sparePartMovement.delete({ where: { id: movement.id } });

  res.status(204).send();
});

const laborEntrySchema = z.object({
  laborResourceId: z.string().uuid(),
  hours: z.coerce.number().positive(),
  hourType: z.nativeEnum(LaborHourType).nullish(),
  startedAt: dataOpcional,
  endedAt: dataOpcional,
  notes: z.string().nullish(),
});

export const addWorkOrderLabor = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = laborEntrySchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const laborResource = await prisma.laborResource.findFirst({ where: { id: data.laborResourceId, deletedAt: null } });
  if (!laborResource) throw new NotFoundError("Recurso de mao de obra");
  if (laborResource.clientId !== workOrder.clientId) {
    throw new ValidationError("Essa mao de obra e' de outra empresa.");
  }

  const entry = await prisma.workOrderLabor.create({
    data: {
      workOrderId: workOrder.id,
      laborResourceId: laborResource.id,
      hours: data.hours,
      hourType: data.hourType,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      notes: data.notes,
      // Snapshot do valor/hora vigente agora - preserva o custo historico mesmo que o
      // recurso mude de valor/hora depois.
      hourlyRateSnapshot: laborResource.hourlyRate,
      createdById: req.user?.sub,
    },
    include: { laborResource: { select: { id: true, name: true, type: true } } },
  });

  res.status(201).json(entry);
});

export const removeWorkOrderLabor = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const entry = await prisma.workOrderLabor.findFirst({ where: { id: req.params.entryId, workOrderId: workOrder.id } });
  if (!entry) throw new NotFoundError("Lancamento de mao de obra");

  await prisma.workOrderLabor.delete({ where: { id: entry.id } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Servicos de terceiros (custo de fornecedor externo contratado pontualmente pra OS).
// ---------------------------------------------------------------------------

const thirdPartyServiceSchema = z.object({
  supplierName: z.string().min(2, "Informe o fornecedor."),
  description: z.string().min(2, "Descreva o servico."),
  cost: z.coerce.number().nonnegative(),
  invoiceNumber: z.string().nullish(),
  notes: z.string().nullish(),
});

export const addWorkOrderThirdPartyService = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = thirdPartyServiceSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const service = await prisma.workOrderThirdPartyService.create({
    data: { ...data, workOrderId: workOrder.id, createdById: req.user?.sub },
  });
  res.status(201).json(service);
});

export const removeWorkOrderThirdPartyService = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const service = await prisma.workOrderThirdPartyService.findFirst({ where: { id: req.params.serviceId, workOrderId: workOrder.id } });
  if (!service) throw new NotFoundError("Servico de terceiro");

  await prisma.workOrderThirdPartyService.delete({ where: { id: service.id } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Reserva de material (planejamento reserva -> tecnico consome no apontamento).
// ---------------------------------------------------------------------------

const reservationSchema = z.object({
  sparePartId: z.string().uuid(),
  quantity: z.coerce.number().int().positive(),
});

export const addWorkOrderReservation = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = reservationSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const sparePart = await prisma.sparePart.findFirst({ where: { id: data.sparePartId, deletedAt: null } });
  if (!sparePart) throw new NotFoundError("Peca do almoxarifado");
  if (sparePart.clientId !== workOrder.clientId) {
    throw new ValidationError("Essa peca e' do almoxarifado de outra empresa.");
  }

  const reservation = await reserveSparePart({
    sparePartId: data.sparePartId,
    workOrderId: workOrder.id,
    quantity: data.quantity,
    createdById: req.user?.sub,
  });
  res.status(201).json(reservation);
});

export const releaseWorkOrderReservation = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const reservation = await prisma.sparePartReservation.findFirst({ where: { id: req.params.reservationId, workOrderId: workOrder.id } });
  if (!reservation) throw new NotFoundError("Reserva");

  const released = await releaseSparePartReservation(reservation.id);
  res.json(released);
});

/**
 * Material previsto da OS: o que a ordem precisa, com obrigatoriedade, substituto e
 * fornecedor sugerido.
 *
 * Ate aqui essa lista so existia nas OS geradas por plano (registro do que a geracao
 * tentou reservar). Numa OS aberta a mao nao havia como dizer o que seria necessario -
 * o planejador so descobria a falta na hora da execucao.
 */
const materialPrevistoSchema = z.object({
  sparePartId: z.string().uuid(),
  quantityNeeded: z.coerce.number().int().positive("Informe a quantidade prevista."),
  required: z.boolean().optional(),
  alternativeSparePartId: z.string().uuid().nullish(),
  suggestedSupplier: z.string().nullish(),
});

export const addWorkOrderPlannedMaterial = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = materialPrevistoSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true, clientId: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  for (const id of [data.sparePartId, data.alternativeSparePartId].filter(Boolean) as string[]) {
    const peca = await prisma.sparePart.findFirst({ where: { id, deletedAt: null }, select: { clientId: true } });
    if (!peca) throw new NotFoundError("Peca do almoxarifado");
    if (peca.clientId !== workOrder.clientId) throw new ValidationError("Essa peca e' de outra empresa.");
  }
  if (data.alternativeSparePartId === data.sparePartId) {
    throw new ValidationError("O substituto precisa ser uma peca diferente da principal.");
  }

  const item = await prisma.workOrderMaterialLog.create({
    data: {
      workOrderId: workOrder.id,
      sparePartId: data.sparePartId,
      quantityNeeded: data.quantityNeeded,
      required: data.required ?? true,
      alternativeSparePartId: data.alternativeSparePartId ?? null,
      suggestedSupplier: data.suggestedSupplier ?? null,
      // Ainda nao reservado: reservar e' um passo proprio, feito pelo planejador.
      reserved: false,
      createdById: req.user?.sub,
    },
    include: materialLogInclude,
  });
  res.status(201).json(item);
});

export const removeWorkOrderPlannedMaterial = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const item = await prisma.workOrderMaterialLog.findFirst({ where: { id: req.params.materialId, workOrderId: workOrder.id } });
  if (!item) throw new NotFoundError("Material previsto");
  await prisma.workOrderMaterialLog.delete({ where: { id: item.id } });
  res.status(204).send();
});

export const consumeWorkOrderReservation = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const reservation = await prisma.sparePartReservation.findFirst({ where: { id: req.params.reservationId, workOrderId: workOrder.id } });
  if (!reservation) throw new NotFoundError("Reserva");

  // Quantidade utilizada: se nao informada, consome a reserva inteira (caso comum).
  const { quantity } = z.object({ quantity: z.coerce.number().int().positive().optional() }).parse(req.body ?? {});
  const resultado = await consumeSparePartReservation(reservation.id, { quantity, createdById: req.user?.sub });
  res.status(201).json(resultado);
});

// ---------------------------------------------------------------------------
// Paradas (janela de ativo parado durante a OS).
// ---------------------------------------------------------------------------

const stoppageSchema = z.object({
  reasonId: z.string().uuid().nullish(),
  startedAt: dataObrigatoria,
  endedAt: dataOpcional,
  notes: z.string().nullish(),
});

async function assertStoppageReasonUsable(reasonId: string | null | undefined, clientId: string) {
  if (!reasonId) return;
  const reason = await prisma.stoppageReason.findFirst({ where: { id: reasonId }, select: { clientId: true } });
  if (!reason) throw new NotFoundError("Motivo de parada");
  if (reason.clientId && reason.clientId !== clientId) {
    throw new ValidationError("Esse motivo de parada e' de outra empresa.");
  }
}

export const addWorkOrderStoppage = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = stoppageSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  await assertStoppageReasonUsable(data.reasonId, workOrder.clientId);

  const stoppage = await prisma.workOrderStoppage.create({
    data: { ...data, workOrderId: workOrder.id, createdById: req.user?.sub },
    include: { reason: { select: { id: true, name: true } } },
  });
  res.status(201).json(stoppage);
});

const stoppageUpdateSchema = z.object({ endedAt: dataOpcional, notes: z.string().nullish() });

/** Encerra uma parada em aberto (registra o fim da janela) - a maioria das paradas
 * comeca sem saber quando vai terminar. */
export const updateWorkOrderStoppage = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = stoppageUpdateSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const existing = await prisma.workOrderStoppage.findFirst({ where: { id: req.params.stoppageId, workOrderId: workOrder.id } });
  if (!existing) throw new NotFoundError("Parada");

  const stoppage = await prisma.workOrderStoppage.update({
    where: { id: existing.id },
    data,
    include: { reason: { select: { id: true, name: true } } },
  });
  res.json(stoppage);
});

export const removeWorkOrderStoppage = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const existing = await prisma.workOrderStoppage.findFirst({ where: { id: req.params.stoppageId, workOrderId: workOrder.id } });
  if (!existing) throw new NotFoundError("Parada");

  await prisma.workOrderStoppage.delete({ where: { id: existing.id } });
  res.status(204).send();
});

async function listWorkOrderAttachments(workOrderId: string) {
  return prisma.attachment.findMany({
    where: { entityType: "MAINTENANCE_WORK_ORDER", entityId: workOrderId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export const listWorkOrderAttachmentsRoute = asyncHandler(async (req: Request, res: Response) => {
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  res.json(await listWorkOrderAttachments(workOrder.id));
});

export const uploadWorkOrderAttachment = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!existing) throw new NotFoundError("Ordem de manutencao");

  const file = req.file;
  if (!file) throw new ValidationError("Selecione um arquivo.");

  const { category, caption } = req.body as { category?: AttachmentCategory; caption?: string };

  const key = `maintenance-work-orders/${existing.id}/${Date.now()}-${file.originalname}`;
  await getStorageProvider().upload(key, file.buffer, file.mimetype);

  const attachment = await prisma.attachment.create({
    data: {
      entityType: "MAINTENANCE_WORK_ORDER",
      entityId: existing.id,
      category: category && category in AttachmentCategory ? category : "OTHER",
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

export const deleteWorkOrderAttachment = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "MAINTENANCE_WORK_ORDER", entityId: workOrder.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  await getStorageProvider().delete(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });

  res.status(204).send();
});

export const getWorkOrderAttachmentUrl = asyncHandler(async (req: Request, res: Response) => {
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "MAINTENANCE_WORK_ORDER", entityId: workOrder.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  const url = await getStorageProvider().getSignedDownloadUrl(attachment.fileKey, attachment.fileName);
  res.json({ url });
});

/**
 * Indicadores de manutencao (MTTR, MTBF, disponibilidade, cumprimento do plano), calculados
 * em memoria a partir das OMs do periodo - volume pequeno, sem necessidade de SQL agregado.
 */
export const getMaintenanceDashboard = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, instrumentId, dateFrom, dateTo } = req.query as {
    clientId?: string;
    instrumentId?: string;
    dateFrom?: string;
    dateTo?: string;
  };

  const periodStart = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const periodEnd = dateTo ? new Date(dateTo) : new Date();

  const periodScopedWhere = {
    deletedAt: null,
    ...resolveClientScope(req, clientId),
    ...(instrumentId ? { instrumentId } : {}),
    createdAt: { gte: periodStart, lte: periodEnd },
  };

  // OS cancelada nao executou nada: contar ela em volume, tipo, MTTR/MTBF, disponibilidade
  // ou custos faz o painel parecer que houve trabalho que nao aconteceu. Ela some destas
  // metricas e vira so uma contagem separada (totals.canceled), abaixo.
  const where = { ...periodScopedWhere, status: { not: "CANCELED" as const } };

  const workOrders = await prisma.maintenanceWorkOrder.findMany({
    where,
    select: {
      id: true, type: true, status: true, startedAt: true, completedAt: true, instrumentId: true, triggeredByMeterId: true, failureStartedAt: true, failureEndedAt: true, createdAt: true,
      partsUsed: { select: { quantity: true, unitCost: true } },
      laborEntries: { select: { hours: true, hourlyRateSnapshot: true } },
      thirdPartyServices: { select: { cost: true } },
    },
  });

  // Custo de uma OS = pecas consumidas + mao de obra apontada (pela taxa vigente na hora,
  // nao a atual) + servicos de terceiros - mesma formula usada no Pareto de falhas.
  function custoDaOrdem(o: (typeof workOrders)[number]): number {
    const pecas = o.partsUsed.reduce((s, p) => s + (p.unitCost ?? 0) * p.quantity, 0);
    const maoDeObra = o.laborEntries.reduce((s, l) => s + (l.hourlyRateSnapshot ?? 0) * l.hours, 0);
    const terceiros = o.thirdPartyServices.reduce((s, t) => s + t.cost, 0);
    return pecas + maoDeObra + terceiros;
  }
  const custosPorTipo = { preventive: 0, corrective: 0, predictive: 0 };
  let custoTotal = 0;
  for (const w of workOrders) {
    const c = custoDaOrdem(w);
    custoTotal += c;
    if (w.type === "PREVENTIVE") custosPorTipo.preventive += c;
    else if (w.type === "CORRECTIVE") custosPorTipo.corrective += c;
    else if (w.type === "PREDICTIVE") custosPorTipo.predictive += c;
  }
  const canceledCount = await prisma.maintenanceWorkOrder.count({
    where: { ...periodScopedWhere, status: "CANCELED" },
  });

  /** Janela de reparo de uma OS, em minutos, pela melhor evidencia disponivel:
   *
   * 1) a janela da falha informada pelo tecnico (inicio -> termino) - e' o tempo real em
   *    que o equipamento ficou fora, e o unico que vale para uma quebra;
   * 2) "Iniciar" -> "Concluir", quando alguem de fato apertou Iniciar antes;
   * 3) nada. A OS nao entra no MTTR.
   *
   * O passo 3 importa: antes, concluir uma OS sem ter apertado Iniciar gravava startedAt
   * igual ao instante da conclusao, e a OS entrava no MTTR valendo zero - o indicador ia
   * para o chao a cada OS fechada direto, que e' o que o tecnico faz na pratica. */
  function minutosDeReparo(w: {
    startedAt: Date | null; completedAt: Date | null;
    failureStartedAt: Date | null; failureEndedAt: Date | null;
  }): number | null {
    if (w.failureStartedAt && w.failureEndedAt) {
      return (w.failureEndedAt.getTime() - w.failureStartedAt.getTime()) / 60000;
    }
    if (w.startedAt && w.completedAt) {
      const minutos = (w.completedAt.getTime() - w.startedAt.getTime()) / 60000;
      // Menos de um minuto = ninguem apertou Iniciar; nao e' um reparo instantaneo.
      return minutos >= 1 ? minutos : null;
    }
    return null;
  }

  const completed = workOrders.filter((w) => w.completedAt);
  const corrective = workOrders.filter((w) => w.type === "CORRECTIVE" && w.completedAt);

  const reparos = completed.map(minutosDeReparo).filter((m): m is number => m != null);
  // Sem reparo medido nao ha MTTR. Zero aqui seria lido como "conserta na hora"; null vira
  // "dados insuficientes" na tela, que e' a verdade.
  const mttrMinutes = reparos.length ? reparos.reduce((a, b) => a + b, 0) / reparos.length : null;

  // MTBF: intervalo medio entre conclusoes de corretivas consecutivas, por ativo.
  const byInstrument = new Map<string, Date[]>();
  for (const w of corrective) {
    const list = byInstrument.get(w.instrumentId) ?? [];
    list.push(w.completedAt!);
    byInstrument.set(w.instrumentId, list);
  }
  // Criticidade de cada ativo com corretiva no periodo - MTBF por criticidade mostra onde
  // investir primeiro (um MTBF baixo num ativo critico pesa muito mais que num de baixa
  // criticidade, e o numero unico da empresa toda escondia essa diferenca).
  const instrumentosComCorretiva = await prisma.instrument.findMany({
    where: { id: { in: [...byInstrument.keys()] } },
    select: { id: true, criticality: true },
  });
  const criticidadePorAtivo = new Map(instrumentosComCorretiva.map((i) => [i.id, i.criticality]));

  const gapsHours: number[] = [];
  const gapsPorCriticidade: Record<string, number[]> = { LOW: [], MEDIUM: [], HIGH: [], CRITICAL: [] };
  for (const [instrumentId, dates] of byInstrument.entries()) {
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
    const criticidade = criticidadePorAtivo.get(instrumentId) ?? "MEDIUM";
    for (let i = 1; i < sorted.length; i++) {
      const horas = (sorted[i].getTime() - sorted[i - 1].getTime()) / 3600000;
      gapsHours.push(horas);
      gapsPorCriticidade[criticidade].push(horas);
    }
  }
  // MTBF precisa de pelo menos duas falhas no mesmo ativo para existir um intervalo. Sem
  // isso e' null - zero significaria "quebra o tempo todo", o oposto do que se sabe.
  const mtbfHours = gapsHours.length ? gapsHours.reduce((a, b) => a + b, 0) / gapsHours.length : null;
  const mtbfByCriticality = Object.fromEntries(
    Object.entries(gapsPorCriticidade).map(([k, arr]) => [k, arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1)) : null]),
  ) as Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number | null>;

  // Indisponibilidade: a janela da falha quando informada (o tempo que a producao ficou
  // parada de verdade), caindo para Iniciar->Concluir quando nao ha registro de falha.
  const paradas = corrective.map(minutosDeReparo).filter((m): m is number => m != null);
  const downtimeMinutes = paradas.reduce((a, b) => a + b, 0);
  const periodMinutes = Math.max(1, (periodEnd.getTime() - periodStart.getTime()) / 60000);
  // Disponibilidade so faz sentido tendo parada medida no periodo; sem nenhuma, o calculo
  // daria 100% - o que nao e' "otimo desempenho", e' ausencia de informacao.
  const availability = paradas.length ? Math.max(0, 1 - downtimeMinutes / periodMinutes) : null;

  const plans = await prisma.maintenancePlan.findMany({
    where: { deletedAt: null, active: true, ...resolveClientScope(req, clientId), ...(instrumentId ? { instrumentId } : {}) },
    select: { nextDueDate: true },
  });
  const now = new Date();
  const onTime = plans.filter((p) => !p.nextDueDate || p.nextDueDate >= now).length;
  const complianceRate = plans.length ? onTime / plans.length : null;

  // ---------------------------------------------------------------------------
  // PCM: backlog, atrasadas/emergenciais, aguardando X, HH planejada x realizada
  // e aderencia a programacao - tudo sobre o estado ATUAL da fila (nao filtrado
  // por data de criacao, diferente das metricas acima), senao um item de backlog
  // criado antes do periodo escolhido sumiria do numero.
  // ---------------------------------------------------------------------------

  const clientScopedWhere = { deletedAt: null, ...resolveClientScope(req, clientId), ...(instrumentId ? { instrumentId } : {}) };

  // Peca abaixo do minimo que atende um ativo critico pesa muito mais que uma peca comum
  // em falta - separado do alerta generico de estoque baixo (que trata toda peca igual)
  // porque e' exatamente essa priorizacao que falta pro PCM decidir o que comprar primeiro.
  const pecasVinculadasACriticos = await prisma.sparePart.findMany({
    where: {
      deletedAt: null,
      active: true,
      ...resolveClientScope(req, clientId),
      assetLinks: { some: { instrument: { deletedAt: null, criticality: { in: ["HIGH", "CRITICAL"] } } } },
    },
    select: {
      id: true, name: true, code: true, stockQty: true, minStock: true,
      assetLinks: {
        where: { instrument: { criticality: { in: ["HIGH", "CRITICAL"] } } },
        select: { instrument: { select: { tag: true, criticality: true } } },
        take: 3,
      },
    },
  });
  const criticalLowStock = pecasVinculadasACriticos
    .filter((p) => p.stockQty <= p.minStock)
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      stockQty: p.stockQty,
      minStock: p.minStock,
      assets: p.assetLinks.map((l) => ({ tag: l.instrument.tag, criticality: l.instrument.criticality })),
    }))
    .sort((a, b) => a.stockQty - b.stockQty)
    .slice(0, 10);

  const openOrders = await prisma.maintenanceWorkOrder.findMany({
    where: { ...clientScopedWhere, status: { notIn: ["COMPLETED", "CANCELED"] } },
    select: { id: true, status: true, priority: true, scheduledDate: true, estimatedHours: true },
  });

  // Backlog e' HH que ainda falta executar: soma a ESTIMATIVA das OS abertas. Antes somava
  // laborHours, que passou a ser o apontamento do que ja foi trabalhado - o backlog ficava
  // vazio justamente nas OS que ninguem comecou.
  const withEstimate = openOrders.filter((w) => w.estimatedHours != null);
  const backlogHours = withEstimate.reduce((sum, w) => sum + (w.estimatedHours ?? 0), 0);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const overdue = openOrders.filter((w) => w.scheduledDate && w.scheduledDate < now && !sameDay(w.scheduledDate, now)).length;
  const emergency = openOrders.filter((w) => w.priority === "CRITICAL").length;

  const completedInPeriod = await prisma.maintenanceWorkOrder.findMany({
    where: { ...clientScopedWhere, status: "COMPLETED", completedAt: { gte: periodStart, lte: periodEnd } },
    select: { id: true, scheduledDate: true, completedAt: true, estimatedHours: true, laborEntries: { select: { hours: true } } },
  });
  const plannedHoursCompleted = completedInPeriod.reduce((sum, w) => sum + (w.estimatedHours ?? 0), 0);
  const actualHoursCompleted = completedInPeriod.reduce((sum, w) => sum + w.laborEntries.reduce((s, l) => s + l.hours, 0), 0);

  const scheduledCompleted = completedInPeriod.filter((w) => w.scheduledDate);
  const onSchedule = scheduledCompleted.filter((w) => w.completedAt! <= w.scheduledDate! || sameDay(w.completedAt!, w.scheduledDate!)).length;
  const scheduleAdherenceRate = scheduledCompleted.length ? onSchedule / scheduledCompleted.length : null;
  // Quando da null, a tela precisa dizer O QUE falta (nao so "dados insuficientes") - senao
  // parece um bug em vez de "ninguem programou data nas OS antes de executar".
  const completedWithoutSchedule = completedInPeriod.length - scheduledCompleted.length;

  res.json({
    period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
    totals: {
      workOrders: workOrders.length,
      // "Aberta" aqui e' qualquer OS que ainda nao terminou (nao so o status literal
      // "OPEN") - senao o numero cai artificialmente assim que a OS avanca pra Planejada/
      // Programada/etc., escondendo trabalho que ainda esta pendente.
      open: workOrders.filter((w) => w.status !== "COMPLETED").length,
      inProgress: workOrders.filter((w) => w.status === "IN_PROGRESS").length,
      completed: workOrders.filter((w) => w.status === "COMPLETED").length,
      corrective: workOrders.filter((w) => w.type === "CORRECTIVE").length,
      preventive: workOrders.filter((w) => w.type === "PREVENTIVE").length,
      predictive: workOrders.filter((w) => w.type === "PREDICTIVE").length,
      // Lubrificacao, inspecao e projeto tambem sao tipos validos de OS, mas nao tem grafico
      // proprio no painel - agrupados aqui para que o total do grafico de composicao bata com
      // o total real (achado ao testar: preventiva+corretiva+preditiva sozinhas ficavam abaixo
      // de totals.workOrders, distorcendo os percentuais da pizza).
      other: workOrders.filter((w) => !["PREVENTIVE", "CORRECTIVE", "PREDICTIVE"].includes(w.type)).length,
      // Quantas dessas preditivas foram abertas sozinhas por uma leitura fora da faixa
      // (em vez de escolhidas a mao) - mede se a preditiva esta funcionando de verdade.
      predictiveAutoOpened: workOrders.filter((w) => w.type === "PREDICTIVE" && w.triggeredByMeterId).length,
      // Indicador separado, nao somado ao volume executado: quem quiser acompanhar
      // cancelamentos ve aqui, sem distorcer os totais de cima.
      canceled: canceledCount,
    },
    // Custo de pecas + mao de obra + terceiros das OS do periodo (canceladas ficam de fora,
    // mesma logica dos totais acima - OS cancelada nao gastou nada de verdade).
    costs: {
      total: Number(custoTotal.toFixed(2)),
      preventive: Number(custosPorTipo.preventive.toFixed(2)),
      corrective: Number(custosPorTipo.corrective.toFixed(2)),
      predictive: Number(custosPorTipo.predictive.toFixed(2)),
    },
    kpis: {
      mttrHours: mttrMinutes == null ? null : Number((mttrMinutes / 60).toFixed(1)),
      mtbfHours: mtbfHours == null ? null : Number(mtbfHours.toFixed(1)),
      availabilityPct: availability == null ? null : Number((availability * 100).toFixed(1)),
      planComplianceRatePct: complianceRate == null ? null : Number((complianceRate * 100).toFixed(1)),
      mtbfByCriticality,
    },
    // PCM: estado atual da fila (nao filtrado pelo periodo escolhido acima).
    pcm: {
      backlogHours: Number(backlogHours.toFixed(1)),
      // Quantas das OS em aberto nao tem HH prevista preenchida - backlogHours so soma
      // quem tem, entao esse numero mostra o quanto o backlog pode estar subestimado.
      openWithoutEstimate: openOrders.length - withEstimate.length,
      overdue,
      emergency,
      awaitingMaterial: openOrders.filter((w) => w.status === "AWAITING_MATERIAL").length,
      awaitingRelease: openOrders.filter((w) => w.status === "AWAITING_RELEASE").length,
      awaitingStoppage: openOrders.filter((w) => w.status === "AWAITING_STOPPAGE").length,
      plannedHoursCompleted: Number(plannedHoursCompleted.toFixed(1)),
      actualHoursCompleted: Number(actualHoursCompleted.toFixed(1)),
      scheduleAdherencePct: scheduleAdherenceRate != null ? Number((scheduleAdherenceRate * 100).toFixed(1)) : null,
      scheduledCompletedCount: scheduledCompleted.length,
      completedWithoutSchedule,
    },
    // Estoque abaixo do minimo que atende ativo de alta criticidade/critico - prioridade
    // de compra diferente de um item comum em falta (mesma logica de risco do resto do
    // painel, so' que aplicada ao almoxarifado).
    criticalLowStock,
  });
});

/**
 * Pareto de falhas: agrupa as OS corretivas do periodo por codigo de falha, ativo e area,
 * somando ocorrencias, tempo parado e custo (pecas + mao de obra + terceiros) - pra
 * responder "quais falhas mais pesam" de tres angulos diferentes sem precisar de SQL
 * agregado (volume pequeno o bastante pra fazer em memoria, mesmo padrao do dashboard).
 */
/** Registros de falha: as OS corretivas em que o tecnico preencheu o que aconteceu.
 * Nao ha tabela separada - a OS corretiva e' o registro do evento, e esta lista so a
 * apresenta pelo angulo da falha (quando comecou, quanto parou, gravidade, causa). */
export const listFailureRecords = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, instrumentId, dateFrom, dateTo, severity } = req.query as {
    clientId?: string; instrumentId?: string; dateFrom?: string; dateTo?: string; severity?: FailureSeverity;
  };
  const pageParams = parsePageParams(req.query as Record<string, unknown>);

  const where = {
    deletedAt: null,
    type: "CORRECTIVE" as const,
    ...resolveClientScope(req, clientId),
    ...(instrumentId ? { instrumentId } : {}),
    ...(severity ? { failureSeverity: severity } : {}),
    // "Registro preenchido" = o tecnico disse ao menos quando a falha comecou ou o quanto
    // ela pesou. Sem isso a OS ainda nao conta uma falha, so um servico corretivo.
    OR: [{ failureStartedAt: { not: null } }, { failureSeverity: { not: null } }],
    ...(dateFrom || dateTo
      ? { failureStartedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.maintenanceWorkOrder.findMany({
      where,
      orderBy: [{ failureStartedAt: "desc" }, { createdAt: "desc" }],
      ...toSkipTake(pageParams),
      select: {
        id: true,
        number: true,
        title: true,
        description: true,
        priority: true,
        status: true,
        failureStartedAt: true,
        failureEndedAt: true,
        failureSeverity: true,
        failureRootCause: true,
        productionLoss: true,
        executionNotes: true,
        failureCode: { select: { id: true, code: true, description: true } },
        instrument: { select: { id: true, tag: true, description: true, type: true, area: { select: { id: true, name: true } } } },
        client: { select: { id: true, companyName: true, tradeName: true } },
        rootCauseAnalyses: { select: { id: true, status: true }, where: { deletedAt: null } },
      },
    }),
    prisma.maintenanceWorkOrder.count({ where }),
  ]);

  // Tempo parado sai da propria janela da falha - nao e' um numero digitado que possa
  // divergir das datas informadas.
  const comDowntime = items.map((o) => ({
    ...o,
    downtimeHours:
      o.failureStartedAt && o.failureEndedAt
        ? (o.failureEndedAt.getTime() - o.failureStartedAt.getTime()) / 3600000
        : null,
  }));

  res.json(buildPagedResult(comDowntime, total, pageParams));
});

/** Backlog do PCM aberto por planta, area, ativo ou centro de custo.
 *
 * Backlog e' a HH pendente da fila. O numero so tem valor se disser TAMBEM quantas OS
 * estao sem estimativa: uma area com "12 h de backlog" e outras 30 OS sem HH prevista nao
 * tem 12 h de trabalho pela frente, e quem olha so o total decide errado. */
export const getMaintenanceBacklog = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, groupBy = "plant", plantId, areaId } = req.query as {
    clientId?: string; groupBy?: string; plantId?: string; areaId?: string;
  };

  const agrupamentos = ["plant", "area", "instrument", "costCenter"] as const;
  type Agrupamento = (typeof agrupamentos)[number];
  if (!agrupamentos.includes(groupBy as Agrupamento)) {
    throw new ValidationError(`Agrupamento invalido. Use: ${agrupamentos.join(", ")}.`);
  }

  const agora = new Date();
  const abertas = await prisma.maintenanceWorkOrder.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["COMPLETED", "CANCELED"] },
      ...resolveClientScope(req, clientId),
      ...(plantId ? { instrument: { plantId } } : {}),
      ...(areaId ? { instrument: { areaId } } : {}),
    },
    select: {
      id: true,
      type: true,
      priority: true,
      scheduledDate: true,
      estimatedHours: true,
      costCenter: { select: { id: true, name: true, code: true } },
      instrument: {
        select: {
          id: true, tag: true, description: true, type: true,
          plant: { select: { id: true, name: true } },
          area: { select: { id: true, name: true } },
        },
      },
    },
  });

  type Linha = {
    id: string; nome: string;
    ordens: number; horas: number; semEstimativa: number;
    atrasadas: number; emergenciais: number; corretivas: number; preventivas: number;
  };
  const linhas = new Map<string, Linha>();

  function chaveDe(o: (typeof abertas)[number]): { id: string; nome: string } {
    if (groupBy === "area") return { id: o.instrument?.area?.id ?? "sem", nome: o.instrument?.area?.name ?? "Sem area" };
    if (groupBy === "instrument") {
      return { id: o.instrument?.id ?? "sem", nome: o.instrument ? `${o.instrument.tag ?? o.instrument.type}${o.instrument.description ? ` - ${o.instrument.description}` : ""}` : "Sem ativo" };
    }
    if (groupBy === "costCenter") {
      // Identidade do centro de custo e' o numero; o nome fica junto so quando existe.
      const cc = o.costCenter;
      const rotulo = cc ? [cc.code, cc.name].filter(Boolean).join(" - ") || "Sem numero" : "Sem centro de custo";
      return { id: cc?.id ?? "sem", nome: rotulo };
    }
    return { id: o.instrument?.plant?.id ?? "sem", nome: o.instrument?.plant?.name ?? "Sem planta" };
  }

  const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString();

  for (const o of abertas) {
    const { id, nome } = chaveDe(o);
    const linha = linhas.get(id) ?? { id, nome, ordens: 0, horas: 0, semEstimativa: 0, atrasadas: 0, emergenciais: 0, corretivas: 0, preventivas: 0 };
    linha.ordens += 1;
    if (o.estimatedHours != null) linha.horas += o.estimatedHours;
    else linha.semEstimativa += 1;
    if (o.scheduledDate && o.scheduledDate < agora && !mesmoDia(o.scheduledDate, agora)) linha.atrasadas += 1;
    if (o.priority === "CRITICAL") linha.emergenciais += 1;
    if (o.type === "CORRECTIVE") linha.corretivas += 1;
    if (o.type === "PREVENTIVE") linha.preventivas += 1;
    linhas.set(id, linha);
  }

  const itens = [...linhas.values()]
    .map((l) => ({ ...l, horas: Number(l.horas.toFixed(1)) }))
    .sort((a, b) => b.horas - a.horas || b.ordens - a.ordens);

  const totalOrdens = abertas.length;
  const totalSemEstimativa = abertas.filter((o) => o.estimatedHours == null).length;

  res.json({
    groupBy,
    itens,
    totais: {
      ordens: totalOrdens,
      horas: Number(itens.reduce((s, i) => s + i.horas, 0).toFixed(1)),
      semEstimativa: totalSemEstimativa,
      // Fracao da fila que entra na conta de horas - se for baixa, o backlog em HH nao
      // representa a fila e a tela precisa dizer isso.
      coberturaPct: totalOrdens > 0 ? Number((((totalOrdens - totalSemEstimativa) / totalOrdens) * 100).toFixed(0)) : null,
    },
  });
});

export const getFailureAnalysis = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, dateFrom, dateTo } = req.query as { clientId?: string; dateFrom?: string; dateTo?: string };

  const periodStart = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const periodEnd = dateTo ? new Date(dateTo) : new Date();

  const orders = await prisma.maintenanceWorkOrder.findMany({
    where: {
      deletedAt: null,
      type: "CORRECTIVE",
      ...resolveClientScope(req, clientId),
      createdAt: { gte: periodStart, lte: periodEnd },
    },
    select: {
      id: true,
      priority: true,
      startedAt: true,
      completedAt: true,
      failureCodeId: true,
      failureCode: { select: { id: true, code: true, description: true } },
      instrumentId: true,
      instrument: { select: { id: true, tag: true, type: true, areaId: true, area: { select: { id: true, name: true } } } },
      partsUsed: { select: { quantity: true, unitCost: true } },
      laborEntries: { select: { hours: true, hourlyRateSnapshot: true } },
      thirdPartyServices: { select: { cost: true } },
    },
  });

  function costOf(o: (typeof orders)[number]): number {
    const parts = o.partsUsed.reduce((s, p) => s + (p.unitCost ?? 0) * p.quantity, 0);
    const labor = o.laborEntries.reduce((s, l) => s + (l.hourlyRateSnapshot ?? 0) * l.hours, 0);
    const thirdParty = o.thirdPartyServices.reduce((s, t) => s + t.cost, 0);
    return parts + labor + thirdParty;
  }
  function downtimeHoursOf(o: (typeof orders)[number]): number {
    if (!o.startedAt || !o.completedAt) return 0;
    return (o.completedAt.getTime() - o.startedAt.getTime()) / 3600000;
  }

  type Bucket = { key: string; label: string; count: number; downtimeHours: number; cost: number };
  function aggregate(getKey: (o: (typeof orders)[number]) => { key: string; label: string } | null): Bucket[] {
    const map = new Map<string, Bucket>();
    for (const o of orders) {
      const k = getKey(o);
      if (!k) continue;
      const bucket = map.get(k.key) ?? { key: k.key, label: k.label, count: 0, downtimeHours: 0, cost: 0 };
      bucket.count += 1;
      bucket.downtimeHours += downtimeHoursOf(o);
      bucket.cost += costOf(o);
      map.set(k.key, bucket);
    }
    return Array.from(map.values())
      .map((b) => ({ ...b, downtimeHours: Number(b.downtimeHours.toFixed(1)), cost: Number(b.cost.toFixed(2)) }))
      .sort((a, b) => b.count - a.count);
  }

  const byFailureCode = aggregate((o) => (o.failureCode ? { key: o.failureCode.id, label: `${o.failureCode.code} - ${o.failureCode.description}` } : null));
  const byInstrument = aggregate((o) => (o.instrument ? { key: o.instrument.id, label: `TAG ${o.instrument.tag ?? o.instrument.type}` } : null));
  const byArea = aggregate((o) => (o.instrument?.area ? { key: o.instrument.area.id, label: o.instrument.area.name } : null));

  res.json({
    period: { from: periodStart.toISOString(), to: periodEnd.toISOString() },
    totalCorrective: orders.length,
    emergency: orders.filter((o) => o.priority === "CRITICAL").length,
    withoutFailureCode: orders.filter((o) => !o.failureCodeId).length,
    recurringFailureCodes: byFailureCode.filter((b) => b.count > 1).length,
    byFailureCode,
    byInstrument,
    byArea,
  });
});

// ---------------------------------------------------------------------------
// Quadro de programacao do PCM: OS pendentes de um lado, semana x mao de obra do
// outro. O arrasta-e-solta da tela chama scheduleMaintenanceWorkOrder.
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = ["COMPLETED", "CANCELED"] as const;

const scheduleCardSelect = {
  id: true,
  number: true,
  description: true,
  type: true,
  priority: true,
  status: true,
  scheduledDate: true,
  laborHours: true,
  assignedResourceId: true,
  // Area entra so pra filtrar o quadro (varias linhas/areas na mesma semana) - o card em
  // si continua mostrando so o TAG, que e' o que basta pra reconhecer o ativo.
  instrument: { select: { id: true, tag: true, type: true, area: { select: { id: true, name: true } } } },
} as const;

export const getMaintenanceSchedule = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, from, to } = req.query as { clientId?: string; from?: string; to?: string };

  const scope = { ...resolveClientScope(req, clientId) };
  // Sem empresa definida nao ha quadro: a mao de obra (as linhas) e' sempre por empresa.
  const resolvedClientId = (scope as { clientId?: string }).clientId;
  if (!resolvedClientId) {
    res.json({ clientId: null, resources: [], scheduled: [], unscheduled: [] });
    return;
  }

  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const openFilter = { deletedAt: null, clientId: resolvedClientId, status: { notIn: [...TERMINAL_STATUSES] } };

  const [resources, scheduled, unscheduled] = await Promise.all([
    prisma.laborResource.findMany({
      where: { clientId: resolvedClientId, deletedAt: null, active: true },
      select: { id: true, name: true, type: true, photoKey: true, photoFileName: true },
      orderBy: { name: "asc" },
    }),
    // Programadas na janela pedida (com ou sem responsavel definido).
    prisma.maintenanceWorkOrder.findMany({
      where: { ...openFilter, scheduledDate: { gte: start, lte: end } },
      select: scheduleCardSelect,
      orderBy: { scheduledDate: "asc" },
    }),
    // Pendentes de programacao: sem data marcada. Sao as "OS gerais" que o PCM distribui.
    prisma.maintenanceWorkOrder.findMany({
      where: { ...openFilter, scheduledDate: null },
      select: scheduleCardSelect,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 200,
    }),
  ]);

  // A foto da pessoa vira link temporario aqui, para o quadro mostrar a miniatura ao lado
  // do nome sem cada coluna ter que buscar a peca por conta propria.
  const storage = getStorageProvider();
  const equipeComFoto = await Promise.all(
    resources.map(async ({ photoKey, photoFileName, ...r }) => ({
      ...r,
      photoUrl: photoKey ? await storage.getSignedDownloadUrl(photoKey, photoFileName ?? "foto", 3600) : null,
    })),
  );

  res.json({ clientId: resolvedClientId, resources: equipeComFoto, scheduled, unscheduled });
});

const scheduleSchema = z.object({
  // null nos dois campos = devolve a OS para a lista de pendentes.
  scheduledDate: dataOpcional,
  assignedResourceId: z.string().uuid().nullish(),
});

export const scheduleMaintenanceWorkOrder = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = scheduleSchema.parse(req.body);
  const existing = await prisma.maintenanceWorkOrder.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, existing.clientId);
  if (TERMINAL_STATUSES.includes(existing.status as (typeof TERMINAL_STATUSES)[number])) {
    throw new ValidationError("OS concluida ou cancelada nao entra na programacao.");
  }
  await assertResourceBelongsToClient(data.assignedResourceId, existing.clientId);

  const workOrder = await prisma.maintenanceWorkOrder.update({
    where: { id: existing.id },
    data: {
      scheduledDate: data.scheduledDate ?? null,
      assignedResourceId: data.assignedResourceId ?? null,
      // Programar uma OS que ainda estava "Aberta" ja a marca como Programada - e' o
      // significado real de arrastar ela para um dia no quadro.
      ...(data.scheduledDate && existing.status === "OPEN" ? { status: "PROGRAMMED" as const } : {}),
    },
    select: { ...scheduleCardSelect, assignedResource: { select: { id: true, name: true } } },
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: data.scheduledDate
      ? `OS ${workOrder.number} programada para ${new Date(data.scheduledDate).toLocaleDateString("pt-BR")}${workOrder.assignedResource ? ` com ${workOrder.assignedResource.name}` : ""}`
      : `OS ${workOrder.number} devolvida para a fila de programacao`,
  });

  res.json(workOrder);
});


const assigneeSchema = z.object({ laborResourceId: z.string().uuid() });

/** Adiciona alguem a equipe de apoio da OS (quem pode atuar junto do responsavel). */
export const addWorkOrderAssignee = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { laborResourceId } = assigneeSchema.parse(req.body);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true, clientId: true, assignedResourceId: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, workOrder.clientId);

  const resource = await prisma.laborResource.findFirst({ where: { id: laborResourceId, deletedAt: null }, select: { clientId: true } });
  if (!resource) throw new NotFoundError("Mao de obra");
  if (resource.clientId !== workOrder.clientId) throw new ValidationError("Essa mao de obra e' de outra empresa.");
  if (workOrder.assignedResourceId === laborResourceId) {
    throw new ValidationError("Essa pessoa ja e' a responsavel pela OS.");
  }

  const existing = await prisma.workOrderAssignee.findFirst({ where: { workOrderId: workOrder.id, laborResourceId } });
  if (existing) throw new ValidationError("Essa pessoa ja esta na equipe desta OS.");

  const assignee = await prisma.workOrderAssignee.create({
    data: { workOrderId: workOrder.id, laborResourceId },
    include: { laborResource: { select: { id: true, name: true, type: true } } },
  });
  res.status(201).json(assignee);
});

export const removeWorkOrderAssignee = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const workOrder = await prisma.maintenanceWorkOrder.findFirst({
    where: { id: req.params.id, deletedAt: null },
    select: { id: true, clientId: true },
  });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, workOrder.clientId);

  const assignee = await prisma.workOrderAssignee.findFirst({ where: { id: req.params.assigneeId, workOrderId: workOrder.id } });
  if (!assignee) throw new NotFoundError("Membro da equipe");

  await prisma.workOrderAssignee.delete({ where: { id: assignee.id } });
  res.status(204).send();
});
