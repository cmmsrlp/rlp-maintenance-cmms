import type { Request, Response } from "express";
import { z } from "zod";
import { dataOpcional } from "../../utils/zod";
import { MaintenancePriority, ServiceRequestStatus, MaintenanceOrderType, CorrectiveType, WorkOrderExecutionCondition, type AttachmentCategory } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, assertServiceAccess, assertOwnClient, resolveClientId, STAFF_ROLES, resolveClientScope } from "../../middleware/rbac";
import { nextClientServiceRequestNumber, nextClientMaintenanceOrderNumber } from "../../utils/sequence";
import { getStorageProvider } from "../../lib/storage";

const detailInclude = {
  client: { select: { id: true, companyName: true, tradeName: true } },
  requestedBy: { select: { id: true, name: true } },
  triageBy: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
  instrument: { select: { id: true, type: true, model: true, serialNumber: true, tag: true } },
  category: { select: { id: true, name: true } },
  workOrder: { select: { id: true, number: true, status: true } },
};

/** O Solicitante so enxerga o que ele mesmo pediu.
 *
 * Ele e' operador de fabrica, nao PCM: ver a fila inteira da empresa nao ajuda no trabalho
 * dele e expoe o que acontece em areas que nao sao dele. Para os demais perfis o filtro e'
 * vazio (a equipe do cliente ve tudo da empresa). */
function escopoDoSolicitante(req: Request): { requestedById?: string } {
  if (req.user?.role === "REQUESTER") {
    if (!req.user.sub) throw new ForbiddenError();
    return { requestedById: req.user.sub };
  }
  return {};
}

export const listServiceRequests = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, status, instrumentId, areaId, search } = req.query as {
    clientId?: string;
    status?: ServiceRequestStatus;
    instrumentId?: string;
    areaId?: string;
    search?: string;
  };

  const where = {
    deletedAt: null,
    ...resolveClientScope(req, clientId),
    ...escopoDoSolicitante(req),
    ...(status ? { status } : {}),
    ...(instrumentId ? { instrumentId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(search ? { number: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
      include: detailInclude,
    }),
    prisma.serviceRequest.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});

export const getServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req), ...escopoDoSolicitante(req) },
    include: detailInclude,
  });
  if (!request) throw new NotFoundError("Solicitacao de servico");
  res.json(request);
});

const requestSchema = z.object({
  clientId: z.string().uuid().optional(),
  areaId: z.string().uuid().nullish(),
  instrumentId: z.string().uuid().nullish(),
  location: z.string().nullish(),
  categoryId: z.string().uuid().nullish(),
  description: z.string().min(2, "Descreva o problema."),
  safetyImpact: z.boolean().optional(),
  qualityImpact: z.boolean().optional(),
  productionImpact: z.boolean().optional(),
  suggestedPriority: z.nativeEnum(MaintenancePriority).optional(),
});

/** Area/ativo/categoria informados precisam ser da mesma empresa da solicitacao. */
async function assertRefsBelongToClient(clientId: string, data: { areaId?: string | null; instrumentId?: string | null; categoryId?: string | null }) {
  if (data.areaId) {
    const area = await prisma.area.findFirst({ where: { id: data.areaId, deletedAt: null } });
    if (!area) throw new NotFoundError("Area");
    if (area.clientId !== clientId) throw new ValidationError("A area selecionada e' de outra empresa.");
  }
  if (data.instrumentId) {
    const instrument = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null } });
    if (!instrument) throw new NotFoundError("Ativo");
    if (instrument.clientId !== clientId) throw new ValidationError("O ativo selecionado e' de outra empresa.");
    // A tela ja mostra so os ativos da area escolhida; aqui e' a garantia de que uma
    // solicitacao nao chega apontando para uma area e um ativo de lugares diferentes -
    // seria impossivel saber qual dos dois esta certo na hora da triagem.
    if (data.areaId && instrument.areaId && instrument.areaId !== data.areaId) {
      throw new ValidationError("O ativo escolhido nao pertence a area selecionada.");
    }
  }
  if (data.categoryId) {
    const category = await prisma.serviceRequestCategory.findFirst({ where: { id: data.categoryId } });
    if (!category) throw new NotFoundError("Categoria de solicitacao");
    if (category.clientId && category.clientId !== clientId) throw new ValidationError("Essa categoria e' de outra empresa.");
  }
}

export const createServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = requestSchema.parse(req.body);
  // Area e' obrigatoria ao ABRIR (na edicao continua opcional, para nao travar
  // solicitacoes antigas que nasceram sem ela). E' a area que diz de quem e' o problema e
  // quem atende - sem ela a solicitacao cai numa fila sem dono.
  if (!data.areaId) throw new ValidationError("Informe a area da solicitacao.");
  const clientId = resolveClientId(req, data.clientId);
  await assertRefsBelongToClient(clientId, data);

  const number = await nextClientServiceRequestNumber(clientId);
  const request = await prisma.serviceRequest.create({
    data: {
      ...data,
      clientId,
      number,
      requestedById: req.user?.sub,
      createdById: req.user?.sub,
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "ServiceRequest",
    entityId: request.id,
    description: `Solicitacao de servico ${request.number} aberta`,
  });

  res.status(201).json(request);
});

const updateSchema = requestSchema.partial();

export const updateServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.serviceRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Solicitacao de servico");
  assertOwnClient(req, existing.clientId);

  // Depois que a triagem decide algo, so a equipe interna edita (o solicitante ja
  // relatou o problema - alterar a descricao depois de aprovada/rejeitada confundiria
  // o que foi decidido).
  const isStaff = req.user?.role && STAFF_ROLES.includes(req.user.role);
  if (!isStaff && !["OPEN", "AWAITING_INFO"].includes(existing.status)) {
    throw new ForbiddenError("Esta solicitacao ja esta em triagem ou foi decidida - nao pode mais ser editada pelo solicitante.");
  }

  if (req.user?.role === "CLIENT") delete data.clientId;
  await assertRefsBelongToClient(data.clientId ?? existing.clientId, data);

  const request = await prisma.serviceRequest.update({ where: { id: existing.id }, data, include: detailInclude });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "ServiceRequest",
    entityId: request.id,
    description: `Solicitacao de servico ${request.number} atualizada`,
  });

  res.json(request);
});

export const deleteServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Solicitacao de servico");
  assertOwnClient(req, existing.clientId);
  // Uma vez convertida em OS, a solicitacao normalmente e' historico permanente - so o
  // ADMIN pode forcar a remocao (ex.: dado de teste). A OS gerada nao e' afetada, so o
  // vinculo a partir da solicitacao some.
  if (existing.status === "CONVERTED" && req.user?.role !== "ADMIN") {
    throw new ValidationError("Esta solicitacao ja virou uma OS e nao pode ser removida. So um administrador pode forcar a remocao.");
  }

  await prisma.serviceRequest.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "ServiceRequest",
    entityId: existing.id,
    description:
      existing.status === "CONVERTED"
        ? `Solicitacao de servico ${existing.number} removida por administrador (ja convertida em OS - a OS nao foi afetada)`
        : `Solicitacao de servico ${existing.number} removida`,
  });

  res.status(204).send();
});

/** Cancela a solicitacao sem apagar o registro - substitui a exclusao para o fluxo normal
 * (quem abriu, ou a equipe, desiste antes de qualquer decisao de triagem). Ao contrario do
 * "remover", isto preserva rastreabilidade: a solicitacao continua visivel, so muda de
 * status e cai na coluna de encerradas do quadro. */
export const cancelServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  // Mesmo escopo de leitura do Solicitante (so enxerga/mexe no que ele mesmo abriu) - sem
  // isso, um Solicitante poderia cancelar a solicitacao de outro colega da mesma empresa.
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null, ...escopoDoSolicitante(req) },
  });
  if (!existing) throw new NotFoundError("Solicitacao de servico");
  assertOwnClient(req, existing.clientId);
  if (["CONVERTED", "REJECTED", "CLOSED", "CANCELED"].includes(existing.status)) {
    throw new ValidationError("Esta solicitacao ja foi encerrada e nao pode mais ser cancelada.");
  }

  const request = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: { status: "CANCELED" },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "ServiceRequest",
    entityId: request.id,
    description: `Solicitacao de servico ${request.number} cancelada`,
  });

  res.json(request);
});

const triageSchema = z.object({
  decision: z.enum(["approve", "request_info", "reject"]),
  notes: z.string().nullish(),
  rejectionReason: z.string().nullish(),
});

/** Triagem: decide se a solicitacao vira uma OS (Planejada), volta pro solicitante
 * (Aguardando informacao) ou e' rejeitada. So a equipe interna faz triagem. */
export const triageServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = triageSchema.parse(req.body);
  const existing = await prisma.serviceRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Solicitacao de servico");
  assertOwnClient(req, existing.clientId);
  if (["CONVERTED", "REJECTED", "CLOSED", "CANCELED"].includes(existing.status)) {
    throw new ValidationError("Esta solicitacao ja foi decidida.");
  }
  if (data.decision === "reject" && !data.rejectionReason) {
    throw new ValidationError("Informe o motivo da rejeicao.");
  }

  const status: ServiceRequestStatus =
    data.decision === "approve" ? "PLANNED" : data.decision === "request_info" ? "AWAITING_INFO" : "REJECTED";

  const request = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: {
      status,
      triageById: req.user?.sub,
      triageNotes: data.notes ?? existing.triageNotes,
      ...(data.decision === "reject" ? { rejectionReason: data.rejectionReason } : {}),
    },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "ServiceRequest",
    entityId: request.id,
    description: `Solicitacao de servico ${request.number}: triagem (${data.decision})`,
  });

  res.json(request);
});

/**
 * O que o planejador decide ao transformar a solicitacao em OS.
 *
 * Tudo opcional para nao quebrar quem chama sem corpo, mas a tela manda os campos: quem
 * escreveu a solicitacao foi o operador ("maquina fazendo barulho"), e o que vai para a
 * OS precisa ser o servico a executar, escrito por quem planeja.
 */
const conversionSchema = z.object({
  title: z.string().min(3, "Escreva um titulo para a OS.").optional(),
  description: z.string().min(5, "Descreva o servico a executar.").optional(),
  type: z.nativeEnum(MaintenanceOrderType).optional(),
  correctiveType: z.nativeEnum(CorrectiveType).nullish(),
  priority: z.nativeEnum(MaintenancePriority).optional(),
  executionCondition: z.nativeEnum(WorkOrderExecutionCondition).nullish(),
  needsPurchase: z.boolean().optional(),
  purchaseNotes: z.string().nullish(),
  scheduledDate: dataOpcional,
});

/** Converte uma solicitacao Planejada numa Ordem de Manutencao de verdade - fecha o
 * ciclo "Solicitacao -> Triagem -> OS" descrito no pedido do usuario. */
export const convertServiceRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const dados = conversionSchema.parse(req.body ?? {});
  const existing = await prisma.serviceRequest.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Solicitacao de servico");
  assertOwnClient(req, existing.clientId);
  if (existing.status !== "PLANNED") {
    throw new ValidationError("So e' possivel gerar OS de uma solicitacao Planejada (aprovada na triagem).");
  }
  if (!existing.instrumentId) {
    throw new ValidationError("Selecione um ativo na solicitacao antes de gerar a OS.");
  }

  // A OS criada por conversao nunca herdava o centro de custo do ativo (ao contrario da
  // criacao direta de OS, que ja fazia isso) - a OS nascia sempre com centro de custo vazio,
  // mesmo quando o ativo tinha um definido (achado na auditoria, ex.: OS-5).
  const instrument = await prisma.instrument.findFirst({
    where: { id: existing.instrumentId, deletedAt: null },
    select: { costCenterId: true },
  });

  const type = dados.type ?? MaintenanceOrderType.CORRECTIVE;
  if (type === "CORRECTIVE" && !dados.correctiveType) {
    throw new ValidationError("Informe se a corretiva e' com a maquina em operacao ou de quebra.");
  }

  // O status inicial sai da propria decisao do planejador, em vez de nascer sempre "Aberta"
  // e depender de alguem lembrar de mudar: OS que espera material fica esperando material,
  // e OS de parada programada fica esperando a parada. Os dois status ja existiam e
  // ninguem os alcancava pela conversao.
  const status = dados.needsPurchase
    ? "AWAITING_MATERIAL"
    : dados.executionCondition === "PLANNED_SHUTDOWN"
      ? "AWAITING_STOPPAGE"
      : "PLANNED";

  const number = await nextClientMaintenanceOrderNumber(existing.clientId);
  const workOrder = await prisma.maintenanceWorkOrder.create({
    data: {
      number,
      clientId: existing.clientId,
      instrumentId: existing.instrumentId,
      costCenterId: instrument?.costCenterId ?? null,
      type,
      correctiveType: type === "CORRECTIVE" ? dados.correctiveType : null,
      priority: dados.priority ?? existing.suggestedPriority,
      status,
      title: dados.title ?? null,
      // A descricao do planejador substitui a do operador; sem ela, a original continua
      // valendo - nenhuma conversao pode acabar com uma OS sem descricao.
      description: dados.description?.trim() || `${existing.number}: ${existing.description}`,
      executionCondition: dados.executionCondition ?? null,
      needsPurchase: dados.needsPurchase ?? false,
      purchaseNotes: dados.purchaseNotes?.trim() || null,
      scheduledDate: dados.scheduledDate ?? null,
      createdById: req.user?.sub,
    },
  });

  const request = await prisma.serviceRequest.update({
    where: { id: existing.id },
    data: { status: "CONVERTED", workOrderId: workOrder.id },
    include: detailInclude,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "ServiceRequest",
    entityId: request.id,
    description: `Solicitacao de servico ${request.number} convertida na OS ${workOrder.number}`,
  });

  res.json(request);
});

// ---------------------------------------------------------------------------
// Anexos da solicitacao (foto do problema, etc.) - mesmo padrao do ativo/OS.
// ---------------------------------------------------------------------------

async function listServiceRequestAttachments(requestId: string) {
  return prisma.attachment.findMany({
    where: { entityType: "SERVICE_REQUEST", entityId: requestId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export const listServiceRequestAttachmentsRoute = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req), ...escopoDoSolicitante(req) },
    select: { id: true },
  });
  if (!request) throw new NotFoundError("Solicitacao de servico");
  res.json(await listServiceRequestAttachments(request.id));
});

export const uploadServiceRequestAttachment = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.serviceRequest.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Solicitacao de servico");

  const file = req.file;
  if (!file) throw new ValidationError("Selecione um arquivo.");

  const { category, caption } = req.body as { category?: AttachmentCategory; caption?: string };

  const key = `service-requests/${existing.id}/${Date.now()}-${file.originalname}`;
  await getStorageProvider().upload(key, file.buffer, file.mimetype);

  const attachment = await prisma.attachment.create({
    data: {
      entityType: "SERVICE_REQUEST",
      entityId: existing.id,
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

export const deleteServiceRequestAttachment = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req), ...escopoDoSolicitante(req) },
    select: { id: true },
  });
  if (!request) throw new NotFoundError("Solicitacao de servico");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "SERVICE_REQUEST", entityId: request.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  await getStorageProvider().delete(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });

  res.status(204).send();
});

export const getServiceRequestAttachmentUrl = asyncHandler(async (req: Request, res: Response) => {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req), ...escopoDoSolicitante(req) },
    select: { id: true },
  });
  if (!request) throw new NotFoundError("Solicitacao de servico");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "SERVICE_REQUEST", entityId: request.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  const url = await getStorageProvider().getSignedDownloadUrl(attachment.fileKey, attachment.fileName);
  res.json({ url });
});
