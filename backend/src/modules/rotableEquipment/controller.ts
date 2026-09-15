import type { Request, Response } from "express";
import { z } from "zod";
import { RotableEquipmentStatus, RotableRepairOutcome, RotableRepairPurpose, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, assertOwnClient, resolveClientId } from "../../middleware/rbac";
import { recalcularCriticidade } from "../../lib/assetCriticality";
import { buildRotableShipmentPdf } from "../../lib/rotableShipmentPdf";
import { tipoPadraoDoNome } from "./camposPorTipo";

function paraJson(valor: Record<string, string> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (valor === undefined) return undefined;
  return valor === null ? Prisma.JsonNull : valor;
}

/**
 * Equipamento recondicionavel (motor, redutor, rolo...): unidade fisica com identidade
 * propria (numero de serie, historico de falha/reparo), separada do Ativo/local onde esta
 * instalada agora. Ver comentario no schema.prisma para o raciocinio completo.
 */

const rotableSelect = {
  id: true,
  clientId: true,
  code: true,
  type: true,
  manufacturer: true,
  model: true,
  serialNumber: true,
  specificAttributes: true,
  status: true,
  currentInstrumentId: true,
  currentInstrument: { select: { id: true, tag: true, description: true, type: true } },
  acquisitionDate: true,
  acquisitionCost: true,
  weightKg: true,
  photoKey: true,
  photoFileName: true,
  notes: true,
  active: true,
  createdAt: true,
} as const;

/** Filtro Prisma da ordem de reparo ainda aberta (nao retornou) de um equipamento - usado
 * so' para a tela distinguir "em reparo, ja com orcamento" de "em reparo, aguardando o
 * fornecedor mandar o orcamento". Nome de campo nao pode ser alias no select do Prisma
 * (tem que ser "repairOrders", o nome de verdade da relacao), entao o resultado e'
 * remapeado para "openRepairOrder" depois da consulta - ver mapOpenRepairOrder. */
const openRepairOrderSelect = {
  where: { returnedAt: null },
  orderBy: { sentAt: "desc" as const },
  take: 1,
  select: { id: true, budgetValue: true },
} as const;

function mapOpenRepairOrder<T extends { repairOrders?: { id: string; budgetValue: number | null }[] }>(item: T) {
  const { repairOrders, ...rest } = item;
  return { ...rest, openRepairOrder: repairOrders?.[0] ?? null };
}

/**
 * Sugere o proximo codigo (ex.: "MOT-004") a partir do prefixo cadastrado no Tipo de
 * ativo escolhido - mesmo raciocinio do proximo-codigo de ponto de lubrificacao: numera a
 * partir do maior sufixo ja usado (nao da contagem), pra apagar um meio da lista nao
 * devolver um codigo que ja existiu. Sem prefixo cadastrado para o tipo, devolve null - a
 * pessoa digita o codigo na mao, como ja funcionava antes desta sugestao existir.
 */
async function sugerirCodigoDeEquipamento(clientId: string, tipo: string): Promise<string | null> {
  const assetType = await prisma.assetType.findFirst({
    where: { name: { equals: tipo, mode: "insensitive" }, OR: [{ clientId }, { clientId: null }] },
    orderBy: { clientId: "desc" }, // o cadastro proprio da empresa (clientId preenchido) vence o padrao
    select: { codePrefix: true },
  });
  const prefixo = assetType?.codePrefix?.trim();
  if (!prefixo) return null;

  const doTipo = await prisma.rotableEquipment.findMany({
    where: { clientId, deletedAt: null, code: { startsWith: `${prefixo}-` } },
    select: { code: true },
  });
  const prefixoEscapado = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const padrao = new RegExp(`^${prefixoEscapado}-(\\d+)$`, "i");
  let proximo = 1;
  for (const { code } of doTipo) {
    const achado = padrao.exec(code);
    if (achado) proximo = Math.max(proximo, Number(achado[1]) + 1);
  }

  for (let tentativa = 0; tentativa < 200; tentativa += 1) {
    const codigo = `${prefixo}-${String(proximo).padStart(3, "0")}`;
    const existe = await prisma.rotableEquipment.findFirst({ where: { clientId, code: codigo, deletedAt: null }, select: { id: true } });
    if (!existe) return codigo;
    proximo += 1;
  }
  return null;
}

export const getNextRotableCode = asyncHandler(async (req: Request, res: Response) => {
  const { type, clientId: bodyClientId } = req.query as { type?: string; clientId?: string };
  if (!type) throw new ValidationError("Informe o tipo.");
  const clientId = resolveClientId(req, bodyClientId);
  res.json({ code: await sugerirCodigoDeEquipamento(clientId, type) });
});

/** Contagem por status, para os indicadores no topo da lista - sempre do total da empresa,
 * sem levar em conta busca/filtro da tabela (senao o indicador mudaria de numero ao digitar
 * na busca, o que confunde mais do que ajuda). */
export const getRotableSummary = asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.query as { clientId?: string };
  const resolvedClientId = clientScopeFilter(req).clientId ?? clientId;
  if (!resolvedClientId) throw new ValidationError("Informe o cliente.");

  const grupos = await prisma.rotableEquipment.groupBy({
    by: ["status"],
    where: { clientId: resolvedClientId, deletedAt: null },
    _count: { _all: true },
  });

  const porStatus: Partial<Record<RotableEquipmentStatus, number>> = {};
  for (const g of grupos) porStatus[g.status] = g._count._all;
  res.json({ porStatus, total: grupos.reduce((soma, g) => soma + g._count._all, 0) });
});

export const listRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, status, type, search, instrumentId, active } = req.query as {
    clientId?: string;
    status?: RotableEquipmentStatus;
    type?: string;
    search?: string;
    instrumentId?: string;
    active?: string;
  };
  const resolvedClientId = clientScopeFilter(req).clientId ?? clientId;
  if (!resolvedClientId) throw new ValidationError("Informe o cliente.");

  const where = {
    clientId: resolvedClientId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(instrumentId ? { currentInstrumentId: instrumentId } : {}),
    ...(active !== undefined ? { active: active === "true" } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { serialNumber: { contains: search, mode: "insensitive" as const } },
            { model: { contains: search, mode: "insensitive" as const } },
            { manufacturer: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.rotableEquipment.findMany({
      where,
      select: { ...rotableSelect, repairOrders: openRepairOrderSelect },
      orderBy: { code: "asc" },
      ...toSkipTake(pageParams),
    }),
    prisma.rotableEquipment.count({ where }),
  ]);

  res.json(buildPagedResult(items.map(mapOpenRepairOrder), total, pageParams));
});

export const getRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const rotable = await prisma.rotableEquipment.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: {
      ...rotableSelect,
      installations: {
        orderBy: { installedAt: "desc" },
        include: {
          instrument: { select: { id: true, tag: true, description: true } },
          workOrder: { select: { id: true, number: true } },
        },
      },
      repairOrders: {
        orderBy: { createdAt: "desc" },
        include: { failureCode: { select: { id: true, code: true, description: true } } },
      },
    },
  });
  if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
  const openRepairOrder = rotable.repairOrders.find((o) => !o.returnedAt) ?? null;
  res.json({ ...rotable, openRepairOrder: openRepairOrder ? { id: openRepairOrder.id, budgetValue: openRepairOrder.budgetValue } : null });
});

const rotableSchema = z.object({
  clientId: z.string().uuid(),
  code: z.string().min(1, "Informe o codigo do equipamento."),
  type: z.string().min(1, "Informe o tipo do equipamento."),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  specificAttributes: z.record(z.string(), z.string()).nullish(),
  acquisitionDate: z.coerce.date().nullish(),
  acquisitionCost: z.coerce.number().nonnegative().nullish(),
  weightKg: z.coerce.number().nonnegative().nullish(),
  notes: z.string().nullish(),
});

export const createRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const data = rotableSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);

  const existing = await prisma.rotableEquipment.findFirst({ where: { clientId, code: data.code, deletedAt: null } });
  if (existing) throw new ValidationError(`Ja existe um equipamento com o codigo "${data.code}" nesta empresa.`);

  const rotable = await prisma.rotableEquipment.create({
    data: { ...data, clientId, specificAttributes: paraJson(data.specificAttributes), createdById: req.user?.sub },
    select: rotableSelect,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "RotableEquipment",
    entityId: rotable.id,
    description: `Equipamento recondicionavel ${rotable.code} cadastrado`,
  });

  res.status(201).json(rotable);
});

export const updateRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const data = rotableSchema.partial().omit({ clientId: true }).parse(req.body);
  const existing = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Equipamento recondicionavel");

  if (data.code && data.code !== existing.code) {
    const clash = await prisma.rotableEquipment.findFirst({ where: { clientId: existing.clientId, code: data.code, deletedAt: null, id: { not: existing.id } } });
    if (clash) throw new ValidationError(`Ja existe um equipamento com o codigo "${data.code}" nesta empresa.`);
  }

  const rotable = await prisma.rotableEquipment.update({
    where: { id: existing.id },
    data: { ...data, specificAttributes: paraJson(data.specificAttributes) },
    select: rotableSelect,
  });
  res.json(rotable);
});

export const deleteRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Equipamento recondicionavel");
  if (existing.status === "INSTALLED") {
    throw new ValidationError("Este equipamento esta instalado num ativo - remova-o antes de excluir o cadastro.");
  }

  await prisma.rotableEquipment.update({ where: { id: existing.id }, data: { deletedAt: new Date(), active: false } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "RotableEquipment",
    entityId: existing.id,
    description: `Equipamento recondicionavel ${existing.code} removido`,
  });

  res.status(204).send();
});

/**
 * Historico de equipamentos recondicionaveis que passaram por este ativo/posicao - o
 * inverso da aba "Instalacoes" da ficha do equipamento (que mostra os ativos por onde ele
 * passou). O ativo e' o local; aqui mostra quem ja ocupou esse local, do mais recente pro
 * mais antigo, incluindo o que esta instalado agora (removedAt nulo).
 */
export const getRotableInstallationHistory = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.instrumentId, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Ativo");

  const installations = await prisma.rotableInstallation.findMany({
    where: { instrumentId: instrument.id },
    orderBy: { installedAt: "desc" },
    include: {
      rotable: { select: { id: true, code: true, type: true, manufacturer: true, model: true, serialNumber: true, status: true } },
      workOrder: { select: { id: true, number: true } },
    },
  });

  res.json(installations);
});

// ---------------------------------------------------------------------------
// Instalar / remover avulso (fora do fluxo de substituicao numa OS)
// ---------------------------------------------------------------------------

const installSchema = z.object({
  instrumentId: z.string().uuid(),
  meterReading: z.coerce.number().nullish(),
  notes: z.string().nullish(),
});

export const installRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const data = installSchema.parse(req.body);
  const rotable = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
  if (rotable.status === "INSTALLED") {
    throw new ValidationError("Este equipamento ja esta instalado - remova-o do ativo atual antes de instalar em outro.");
  }
  if (rotable.status === "SCRAPPED") throw new ValidationError("Este equipamento foi sucateado e nao pode ser instalado.");

  const instrument = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null } });
  if (!instrument) throw new NotFoundError("Ativo");
  if (instrument.clientId !== rotable.clientId) throw new ValidationError("Esse ativo pertence a outra empresa.");

  const jaInstalado = await prisma.rotableEquipment.findFirst({ where: { currentInstrumentId: instrument.id, deletedAt: null } });
  if (jaInstalado) {
    throw new ValidationError(`O ativo ja tem o equipamento ${jaInstalado.code} instalado - remova-o antes de instalar outro.`);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.rotableEquipment.update({
      where: { id: rotable.id },
      data: { status: "INSTALLED", currentInstrumentId: instrument.id },
    });
    const installation = await tx.rotableInstallation.create({
      data: {
        rotableId: rotable.id,
        instrumentId: instrument.id,
        meterReadingAtInstall: data.meterReading ?? undefined,
        installedById: req.user?.sub,
        notes: data.notes ?? null,
      },
    });
    return installation;
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "RotableEquipment",
    entityId: rotable.id,
    description: `Equipamento ${rotable.code} instalado em ${instrument.tag ?? instrument.description ?? instrument.id}`,
  });
  await recalcularCriticidade(instrument.id, "EQUIPMENT_MOVED");

  res.status(201).json(resultado);
});

const removeSchema = z.object({
  removalReason: z.string().nullish(),
  conditionAtRemoval: z.string().nullish(),
  meterReading: z.coerce.number().nullish(),
  destinationStatus: z.enum(["IN_STOCK", "QUARANTINE"]).default("QUARANTINE"),
  notes: z.string().nullish(),
});

export const removeRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const data = removeSchema.parse(req.body);
  const rotable = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
  if (rotable.status !== "INSTALLED" || !rotable.currentInstrumentId) {
    throw new ValidationError("Este equipamento nao esta instalado em nenhum ativo agora.");
  }

  const instalacaoAberta = await prisma.rotableInstallation.findFirst({
    where: { rotableId: rotable.id, instrumentId: rotable.currentInstrumentId, removedAt: null },
    orderBy: { installedAt: "desc" },
  });
  if (!instalacaoAberta) throw new NotFoundError("Registro de instalacao aberto");
  const instrumentoAnterior = rotable.currentInstrumentId;

  await prisma.$transaction(async (tx) => {
    await tx.rotableInstallation.update({
      where: { id: instalacaoAberta.id },
      data: {
        removedAt: new Date(),
        removedById: req.user?.sub,
        removalReason: data.removalReason ?? null,
        conditionAtRemoval: data.conditionAtRemoval ?? null,
        meterReadingAtRemoval: data.meterReading ?? undefined,
        notes: data.notes ?? instalacaoAberta.notes,
      },
    });
    await tx.rotableEquipment.update({
      where: { id: rotable.id },
      data: { status: data.destinationStatus, currentInstrumentId: null },
    });
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "RotableEquipment",
    entityId: rotable.id,
    description: `Equipamento ${rotable.code} removido do ativo`,
  });
  if (instrumentoAnterior) await recalcularCriticidade(instrumentoAnterior, "EQUIPMENT_MOVED");

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Substituir equipamento: a operacao-chave, sempre dentro de uma OS.
//
// Retira o avariado, registra data/motivo/condicao/horimetro, manda para quarentena (ou
// direto pro estoque se o planejador marcar que nao precisa de reparo), instala o reserva
// no mesmo local, registra quem fez e abre a ordem de reparo do equipamento retirado -
// tudo numa unica transacao: ou fecha tudo, ou nao muda nada (evita equipamento
// "desaparecido" ou instalado em dois lugares ao mesmo tempo).
// ---------------------------------------------------------------------------

const substituteSchema = z.object({
  workOrderId: z.string().uuid(),
  outgoingRotableId: z.string().uuid(),
  incomingRotableId: z.string().uuid(),
  removalReason: z.string().nullish(),
  conditionAtRemoval: z.string().nullish(),
  meterReadingAtRemoval: z.coerce.number().nullish(),
  meterReadingAtInstall: z.coerce.number().nullish(),
  // Se o retirado nao precisa de reparo (ex.: troca preventiva programada, peca boa),
  // pode ir direto pro estoque sem abrir ordem de reparo.
  openRepairOrder: z.boolean().default(true),
  repairOrder: z
    .object({
      defectReported: z.string().nullish(),
      failureCodeId: z.string().uuid().nullish(),
      vendor: z.string().nullish(),
    })
    .nullish(),
});

export const substituteRotableEquipment = asyncHandler(async (req: Request, res: Response) => {
  const data = substituteSchema.parse(req.body);

  const workOrder = await prisma.maintenanceWorkOrder.findFirst({ where: { id: data.workOrderId, deletedAt: null } });
  if (!workOrder) throw new NotFoundError("Ordem de manutencao");
  assertOwnClient(req, workOrder.clientId);

  const [outgoing, incoming] = await Promise.all([
    prisma.rotableEquipment.findFirst({ where: { id: data.outgoingRotableId, deletedAt: null } }),
    prisma.rotableEquipment.findFirst({ where: { id: data.incomingRotableId, deletedAt: null } }),
  ]);
  if (!outgoing) throw new NotFoundError("Equipamento retirado");
  if (!incoming) throw new NotFoundError("Equipamento reserva");
  if (outgoing.clientId !== workOrder.clientId || incoming.clientId !== workOrder.clientId) {
    throw new ValidationError("Os equipamentos precisam ser da mesma empresa da OS.");
  }
  if (outgoing.status !== "INSTALLED" || outgoing.currentInstrumentId !== workOrder.instrumentId) {
    throw new ValidationError("O equipamento a retirar nao esta instalado neste ativo agora.");
  }
  if (incoming.status !== "IN_STOCK") {
    throw new ValidationError(`O equipamento reserva "${incoming.code}" nao esta em estoque (status atual: ${incoming.status}).`);
  }
  if (incoming.type !== outgoing.type) {
    throw new ValidationError(`O equipamento reserva "${incoming.code}" e' do tipo "${incoming.type}", diferente do retirado ("${outgoing.type}").`);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    const instalacaoAberta = await tx.rotableInstallation.findFirst({
      where: { rotableId: outgoing.id, instrumentId: workOrder.instrumentId, removedAt: null },
      orderBy: { installedAt: "desc" },
    });

    // 1. Retira o avariado: fecha a instalacao com data/motivo/condicao/horimetro.
    if (instalacaoAberta) {
      await tx.rotableInstallation.update({
        where: { id: instalacaoAberta.id },
        data: {
          removedAt: new Date(),
          removedById: req.user?.sub,
          removalReason: data.removalReason ?? null,
          conditionAtRemoval: data.conditionAtRemoval ?? null,
          meterReadingAtRemoval: data.meterReadingAtRemoval ?? undefined,
          workOrderId: workOrder.id,
        },
      });
    }

    // 3. Move o avariado para quarentena (ou estoque, se nao precisar de reparo).
    await tx.rotableEquipment.update({
      where: { id: outgoing.id },
      data: { status: data.openRepairOrder ? "QUARANTINE" : "IN_STOCK", currentInstrumentId: null },
    });

    // 4/5. Instala o reserva no mesmo local funcional.
    await tx.rotableEquipment.update({
      where: { id: incoming.id },
      data: { status: "INSTALLED", currentInstrumentId: workOrder.instrumentId },
    });
    const novaInstalacao = await tx.rotableInstallation.create({
      data: {
        rotableId: incoming.id,
        instrumentId: workOrder.instrumentId,
        meterReadingAtInstall: data.meterReadingAtInstall ?? undefined,
        installedById: req.user?.sub,
        workOrderId: workOrder.id,
      },
    });

    // 6. Vincula a OS ao equipamento que apresentou a falha (o retirado) - o vinculo
    // duplo: instrumentId ja e' o local funcional, isto aqui e' a unidade fisica.
    await tx.maintenanceWorkOrder.update({
      where: { id: workOrder.id },
      data: { rotableEquipmentId: outgoing.id },
    });

    // 8. Abre a ordem de reparo do retirado, quando fizer sentido.
    let repairOrder = null;
    if (data.openRepairOrder) {
      repairOrder = await tx.rotableRepairOrder.create({
        data: {
          rotableId: outgoing.id,
          workOrderId: workOrder.id,
          defectReported: data.repairOrder?.defectReported ?? data.conditionAtRemoval ?? null,
          failureCodeId: data.repairOrder?.failureCodeId ?? null,
          vendor: data.repairOrder?.vendor ?? null,
          createdById: req.user?.sub,
        },
      });
    }

    return { installation: novaInstalacao, repairOrder };
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `Substituicao de equipamento na OS ${workOrder.number}: ${outgoing.code} saiu, ${incoming.code} entrou`,
  });
  await recalcularCriticidade(workOrder.instrumentId, "EQUIPMENT_MOVED");

  res.status(201).json(resultado);
});

// ---------------------------------------------------------------------------
// Ordens de reparo
// ---------------------------------------------------------------------------

const repairOrderSelect = {
  id: true,
  rotableId: true,
  workOrderId: true,
  defectReported: true,
  diagnosis: true,
  failureCodeId: true,
  failureCode: { select: { id: true, code: true, description: true } },
  vendor: true,
  purpose: true,
  sentAt: true,
  budgetNumber: true,
  budgetValue: true,
  budgetStatus: true,
  approvedById: true,
  approvedAt: true,
  promisedReturnAt: true,
  returnedAt: true,
  serviceDone: true,
  partsReplacedNotes: true,
  laborNotes: true,
  testsPerformed: true,
  finalReport: true,
  warrantyMonths: true,
  warrantyNotes: true,
  finalCost: true,
  conditionAfterRepair: true,
  outcome: true,
  notes: true,
  createdAt: true,
} as const;

export const listRepairOrders = asyncHandler(async (req: Request, res: Response) => {
  const rotable = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
  const orders = await prisma.rotableRepairOrder.findMany({ where: { rotableId: rotable.id }, select: repairOrderSelect, orderBy: { createdAt: "desc" } });
  res.json(orders);
});

const createRepairOrderSchema = z.object({
  defectReported: z.string().nullish(),
  diagnosis: z.string().nullish(),
  failureCodeId: z.string().uuid().nullish(),
  vendor: z.string().nullish(),
  purpose: z.nativeEnum(RotableRepairPurpose).optional(),
  budgetNumber: z.string().nullish(),
  budgetValue: z.coerce.number().nonnegative().nullish(),
  promisedReturnAt: z.coerce.date().nullish(),
  notes: z.string().nullish(),
});

/** Ordem de reparo avulsa - para um equipamento que ja esta em estoque/quarentena e vai
 * ser mandado pro conserto sem ter passado por uma substituicao agora. */
export const createRepairOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = createRepairOrderSchema.parse(req.body);
  const rotable = await prisma.rotableEquipment.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!rotable) throw new NotFoundError("Equipamento recondicionavel");
  if (rotable.status === "INSTALLED") throw new ValidationError("Remova o equipamento do ativo antes de abrir uma ordem de reparo.");

  const [order] = await prisma.$transaction([
    prisma.rotableRepairOrder.create({ data: { ...data, rotableId: rotable.id, createdById: req.user?.sub }, select: repairOrderSelect }),
    prisma.rotableEquipment.update({ where: { id: rotable.id }, data: { status: "IN_RECONDITIONING" } }),
  ]);

  res.status(201).json(order);
});

const updateRepairOrderSchema = createRepairOrderSchema.partial().extend({
  serviceDone: z.string().nullish(),
  partsReplacedNotes: z.string().nullish(),
  laborNotes: z.string().nullish(),
  testsPerformed: z.string().nullish(),
  finalReport: z.string().nullish(),
  warrantyMonths: z.coerce.number().int().nonnegative().nullish(),
  warrantyNotes: z.string().nullish(),
  finalCost: z.coerce.number().nonnegative().nullish(),
  conditionAfterRepair: z.string().nullish(),
});

async function getOwnRepairOrder(req: Request, id: string) {
  const order = await prisma.rotableRepairOrder.findFirst({ where: { id }, include: { rotable: true } });
  if (!order) throw new NotFoundError("Ordem de reparo");
  assertOwnClient(req, order.rotable.clientId);
  return order;
}

export const updateRepairOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = updateRepairOrderSchema.parse(req.body);
  await getOwnRepairOrder(req, req.params.id);
  const order = await prisma.rotableRepairOrder.update({ where: { id: req.params.id }, data, select: repairOrderSelect });
  res.json(order);
});

const budgetDecisionSchema = z.object({ notes: z.string().nullish() });

export const approveRepairBudget = asyncHandler(async (req: Request, res: Response) => {
  budgetDecisionSchema.parse(req.body ?? {});
  const existing = await getOwnRepairOrder(req, req.params.id);
  if (existing.budgetStatus !== "PENDING") throw new ValidationError("Este orcamento ja foi decidido.");
  const order = await prisma.rotableRepairOrder.update({
    where: { id: existing.id },
    data: { budgetStatus: "APPROVED", approvedById: req.user?.sub, approvedAt: new Date() },
    select: repairOrderSelect,
  });
  res.json(order);
});

export const rejectRepairBudget = asyncHandler(async (req: Request, res: Response) => {
  budgetDecisionSchema.parse(req.body ?? {});
  const existing = await getOwnRepairOrder(req, req.params.id);
  if (existing.budgetStatus !== "PENDING") throw new ValidationError("Este orcamento ja foi decidido.");
  const order = await prisma.rotableRepairOrder.update({
    where: { id: existing.id },
    data: { budgetStatus: "REJECTED", approvedById: req.user?.sub, approvedAt: new Date() },
    select: repairOrderSelect,
  });
  res.json(order);
});

const returnRepairOrderSchema = z.object({
  outcome: z.nativeEnum(RotableRepairOutcome),
  serviceDone: z.string().nullish(),
  partsReplacedNotes: z.string().nullish(),
  laborNotes: z.string().nullish(),
  testsPerformed: z.string().nullish(),
  finalReport: z.string().nullish(),
  warrantyMonths: z.coerce.number().int().nonnegative().nullish(),
  warrantyNotes: z.string().nullish(),
  finalCost: z.coerce.number().nonnegative().nullish(),
  conditionAfterRepair: z.string().nullish(),
});

/** Fecha a ordem de reparo (o equipamento voltou) e atualiza o status do equipamento
 * conforme o resultado - reparado volta pro estoque, sucateado sai de circulacao. */
export const returnFromRepair = asyncHandler(async (req: Request, res: Response) => {
  const data = returnRepairOrderSchema.parse(req.body);
  const existing = await getOwnRepairOrder(req, req.params.id);
  if (existing.returnedAt) throw new ValidationError("Esta ordem de reparo ja foi encerrada.");

  const novoStatus: RotableEquipmentStatus = data.outcome === "SCRAPPED" ? "SCRAPPED" : "IN_STOCK";

  const [order] = await prisma.$transaction([
    prisma.rotableRepairOrder.update({
      where: { id: existing.id },
      data: { ...data, returnedAt: new Date() },
      select: repairOrderSelect,
    }),
    prisma.rotableEquipment.update({ where: { id: existing.rotableId }, data: { status: novoStatus } }),
  ]);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "RotableEquipment",
    entityId: existing.rotableId,
    description: `Equipamento retornou do reparo - resultado: ${data.outcome}`,
  });

  res.json(order);
});

/** Ficha de envio (PDF) da ordem de reparo - puxa os dados ja cadastrados do equipamento
 * (codigo, tipo, fabricante, modelo, numero de serie, peso, valor, ficha tecnica) para a
 * area que emite a nota fiscal de remessa (conserto, garantia ou simples remessa). */
export const getRepairOrderShipmentPdf = asyncHandler(async (req: Request, res: Response) => {
  const order = await getOwnRepairOrder(req, req.params.id);
  const [client, failureCode] = await Promise.all([
    prisma.client.findFirst({ where: { id: order.rotable.clientId } }),
    order.failureCodeId ? prisma.failureCode.findFirst({ where: { id: order.failureCodeId } }) : null,
  ]);
  if (!client) throw new NotFoundError("Cliente");

  const atributoLabels = Object.fromEntries((tipoPadraoDoNome(order.rotable.type)?.campos ?? []).map((c) => [c.chave, c.rotulo]));

  const pdf = await buildRotableShipmentPdf({
    rotable: order.rotable,
    repairOrder: order,
    client,
    failureCode,
    atributoLabels,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="ficha-de-envio-${order.rotable.code}.pdf"`);
  res.end(pdf);
});
