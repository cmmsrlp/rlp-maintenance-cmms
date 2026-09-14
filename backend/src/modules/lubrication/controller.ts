import type { Request, Response } from "express";
import { z } from "zod";
import { dataOpcional } from "../../utils/zod";
import { LubricantBase, LubricantType, LubricationCondition, LubricationMethod, MachineStateForLubrication } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { assertOwnClient, assertServiceAccess, clientScopeFilter, resolveClientId, resolveClientScope } from "../../middleware/rbac";
import { buildPagedResult, parsePageParams, toSkipTake } from "../../utils/pagination";
import { writeAuditLog } from "../../utils/audit";
import { applySparePartMovement } from "../../lib/inventory";
import { nextClientMaintenanceOrderNumber } from "../../utils/sequence";

const UM_DIA = 24 * 60 * 60 * 1000;

function somaDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * UM_DIA);
}

// ---------------------------------------------------------------------------
// Lubrificantes (ficha tecnica sobre uma peca do almoxarifado)
// ---------------------------------------------------------------------------

const lubricantSchema = z.object({
  clientId: z.string().uuid().optional(),
  sparePartId: z.string().uuid(),
  type: z.nativeEnum(LubricantType).optional(),
  specification: z.string().nullish(),
  base: z.nativeEnum(LubricantBase).nullish(),
  manufacturer: z.string().nullish(),
  application: z.string().nullish(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
  // Quanto vem numa embalagem fechada (na unidade da peca do almoxarifado, ex.: 1,8 kg).
  // Em branco = lubrificante nao rastreado por embalagem (cada aplicacao baixa o estoque
  // direto, comportamento antigo - ok para quem dispensa de um tambor/reservatorio, sem
  // embalagem individual para abrir).
  packageSize: z.coerce.number().positive().nullish(),
});

const lubricantInclude = {
  sparePart: { select: { id: true, name: true, code: true, unit: true, stockQty: true, minStock: true } },
} as const;

export const listLubricants = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, active } = req.query as { clientId?: string; active?: string };
  const lubricants = await prisma.lubricant.findMany({
    where: {
      deletedAt: null,
      ...resolveClientScope(req, clientId),
      ...(active !== undefined ? { active: active === "true" } : {}),
    },
    include: lubricantInclude,
    orderBy: { sparePart: { name: "asc" } },
  });
  res.json(lubricants);
});

export const createLubricant = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = lubricantSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);

  const peca = await prisma.sparePart.findFirst({ where: { id: data.sparePartId, deletedAt: null }, select: { clientId: true, name: true } });
  if (!peca) throw new NotFoundError("Peca do almoxarifado");
  if (peca.clientId !== clientId) throw new ValidationError("Essa peca e' de outra empresa.");

  const jaExiste = await prisma.lubricant.findFirst({ where: { sparePartId: data.sparePartId, deletedAt: null } });
  if (jaExiste) throw new ValidationError(`"${peca.name}" ja esta cadastrado como lubrificante.`);

  const lubricant = await prisma.lubricant.create({
    data: { ...data, clientId, createdById: req.user?.sub },
    include: lubricantInclude,
  });
  await writeAuditLog({ userId: req.user?.sub, action: "CREATE", entityType: "Lubricant", entityId: lubricant.id, description: `Lubrificante ${peca.name} cadastrado` });
  res.status(201).json(lubricant);
});

export const updateLubricant = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = lubricantSchema.partial().parse(req.body);
  const existing = await prisma.lubricant.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Lubrificante");
  assertOwnClient(req, existing.clientId);

  // Trocar a peca vinculada mudaria o saldo e o historico de consumo de lugar - se o
  // lubrificante e' outro, o cadastro tambem e' outro.
  const { sparePartId, clientId, ...resto } = data;
  if (sparePartId && sparePartId !== existing.sparePartId) {
    throw new ValidationError("Nao da para trocar a peca de um lubrificante ja cadastrado. Cadastre outro lubrificante.");
  }

  const lubricant = await prisma.lubricant.update({ where: { id: existing.id }, data: resto, include: lubricantInclude });
  res.json(lubricant);
});

export const deleteLubricant = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.lubricant.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Lubrificante");
  assertOwnClient(req, existing.clientId);

  const emUso = await prisma.lubricationPoint.count({ where: { lubricantId: existing.id, deletedAt: null } });
  if (emUso > 0) throw new ValidationError(`Este lubrificante e' usado por ${emUso} ponto(s). Troque o lubrificante desses pontos antes de remover.`);

  await prisma.lubricant.update({ where: { id: existing.id }, data: { deletedAt: new Date(), active: false } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Pontos de lubrificacao
// ---------------------------------------------------------------------------

const pointSchema = z.object({
  clientId: z.string().uuid().optional(),
  instrumentId: z.string().uuid(),
  // Em branco o sistema numera sozinho a partir do TAG do ativo - um motor tem
  // varios pontos, e batizar cada um na mao e' onde nascem os codigos repetidos.
  code: z.string().optional(),
  name: z.string().min(2, "Informe o nome do ponto."),
  component: z.string().nullish(),
  lubricantId: z.string().uuid(),
  quantityPerApplication: z.coerce.number().positive("A quantidade por aplicacao precisa ser maior que zero."),
  method: z.nativeEnum(LubricationMethod),
  frequencyDays: z.coerce.number().int().positive("A periodicidade precisa ser de pelo menos 1 dia."),
  machineState: z.nativeEnum(MachineStateForLubrication).optional(),
  accessNotes: z.string().nullish(),
  safetyNotes: z.string().nullish(),
  lastLubricatedAt: dataOpcional,
  active: z.boolean().optional(),
});

const pointInclude = {
  instrument: { select: { id: true, tag: true, description: true, type: true, area: { select: { id: true, name: true } }, plant: { select: { id: true, name: true } } } },
  lubricant: { include: lubricantInclude },
} as const;

/** Proxima aplicacao = ultima + periodicidade. Nunca lubrificado ainda: vence hoje, porque
 * um ponto cadastrado e nunca atendido e' justamente o que precisa aparecer na lista. */
function proximaAplicacao(ultima: Date | null | undefined, frequencyDays: number): Date {
  return ultima ? somaDias(ultima, frequencyDays) : new Date();
}

export const listLubricationPoints = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, instrumentId, lubricantId, routeId, situacao, search } = req.query as {
    clientId?: string; instrumentId?: string; lubricantId?: string; routeId?: string; situacao?: string; search?: string;
  };

  const hoje = new Date();
  const where = {
    deletedAt: null,
    active: true,
    ...resolveClientScope(req, clientId),
    ...(instrumentId ? { instrumentId } : {}),
    ...(lubricantId ? { lubricantId } : {}),
    ...(routeId ? { routeItems: { some: { routeId } } } : {}),
    ...(situacao === "vencidos" ? { nextDueAt: { lt: hoje } } : {}),
    ...(situacao === "proximos" ? { nextDueAt: { gte: hoje, lte: somaDias(hoje, 7) } } : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { component: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lubricationPoint.findMany({ where, include: pointInclude, orderBy: [{ nextDueAt: "asc" }, { code: "asc" }], ...toSkipTake(pageParams) }),
    prisma.lubricationPoint.count({ where }),
  ]);
  res.json(buildPagedResult(items, total, pageParams));
});

export const getLubricationPoint = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const point = await prisma.lubricationPoint.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: {
      ...pointInclude,
      routeItems: { include: { route: { select: { id: true, name: true } } } },
      records: {
        orderBy: { executedAt: "desc" },
        take: 50,
        include: {
          lubricant: { include: lubricantInclude },
          laborResource: { select: { id: true, name: true } },
          workOrder: { select: { id: true, number: true } },
        },
      },
    },
  });
  if (!point) throw new NotFoundError("Ponto de lubrificacao");
  res.json(point);
});

async function assertRefsDoPonto(clientId: string, data: { instrumentId?: string; lubricantId?: string }) {
  if (data.instrumentId) {
    const ativo = await prisma.instrument.findFirst({ where: { id: data.instrumentId, deletedAt: null }, select: { clientId: true } });
    if (!ativo) throw new NotFoundError("Ativo");
    if (ativo.clientId !== clientId) throw new ValidationError("Esse ativo e' de outra empresa.");
  }
  if (data.lubricantId) {
    const lub = await prisma.lubricant.findFirst({ where: { id: data.lubricantId, deletedAt: null }, select: { clientId: true } });
    if (!lub) throw new NotFoundError("Lubrificante");
    if (lub.clientId !== clientId) throw new ValidationError("Esse lubrificante e' de outra empresa.");
  }
}


/**
 * Proximo codigo livre para um ponto deste ativo: "<TAG do ativo>-PT-01", -PT-02...
 *
 * O prefixo e' o TAG e nao o nome da area de proposito: um motor e uma bomba na mesma
 * area teriam a mesma numeracao, e o codigo do ponto e' unico por empresa. Como o TAG ja
 * carrega a area na propria estrutura (VMA-VL4-DOS-BAL-001), a area continua legivel no
 * codigo sem abrir espaco para colisao.
 */
export async function sugerirCodigoDePonto(clientId: string, instrumentId: string): Promise<string> {
  const ativo = await prisma.instrument.findFirst({
    where: { id: instrumentId, clientId, deletedAt: null },
    select: { tag: true, area: { select: { code: true, name: true } } },
  });

  const prefixo =
    ativo?.tag?.trim() ||
    ativo?.area?.code?.trim() ||
    ativo?.area?.name?.trim().toUpperCase().replace(/\s+/g, "-") ||
    "PT";

  // Numera a partir do maior sufixo ja usado NESTE ativo, e nao da contagem de pontos:
  // apagar o PT-02 e criar outro nao pode devolver um codigo que ja existiu.
  const doAtivo = await prisma.lubricationPoint.findMany({
    where: { clientId, instrumentId, deletedAt: null },
    select: { code: true },
  });
  // O prefixo vem de um TAG digitado pelo usuario: escapado antes de virar regex.
  const prefixoEscapado = prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const padrao = new RegExp(`^${prefixoEscapado}-PT-(\\d+)$`, "i");
  let proximo = 1;
  for (const { code } of doAtivo) {
    const achado = padrao.exec(code);
    if (achado) proximo = Math.max(proximo, Number(achado[1]) + 1);
  }

  // O codigo e' unico por empresa: se alguem ja usou este numero noutro lugar, segue.
  for (let tentativa = 0; tentativa < 200; tentativa += 1) {
    const codigo = `${prefixo}-PT-${String(proximo).padStart(2, "0")}`;
    const existe = await prisma.lubricationPoint.findFirst({ where: { clientId, code: codigo, deletedAt: null }, select: { id: true } });
    if (!existe) return codigo;
    proximo += 1;
  }
  throw new ValidationError("Nao consegui gerar um codigo livre para este ponto. Informe um manualmente.");
}

/** A tela pede a sugestao assim que o ativo e' escolhido, para o campo ja vir preenchido
 * e ainda assim editavel. */
export const getNextLubricationPointCode = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { instrumentId, clientId } = req.query as { instrumentId?: string; clientId?: string };
  if (!instrumentId) throw new ValidationError("Informe o ativo.");
  res.json({ code: await sugerirCodigoDePonto(resolveClientId(req, clientId), instrumentId) });
});

export const createLubricationPoint = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = pointSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);
  await assertRefsDoPonto(clientId, data);

  const code = data.code?.trim() || (await sugerirCodigoDePonto(clientId, data.instrumentId));

  const duplicado = await prisma.lubricationPoint.findFirst({ where: { clientId, code, deletedAt: null } });
  if (duplicado) throw new ValidationError(`Ja existe um ponto com o codigo "${code}".`);

  const point = await prisma.lubricationPoint.create({
    data: {
      ...data,
      code,
      clientId,
      nextDueAt: proximaAplicacao(data.lastLubricatedAt, data.frequencyDays),
      createdById: req.user?.sub,
    },
    include: pointInclude,
  });
  await writeAuditLog({ userId: req.user?.sub, action: "CREATE", entityType: "LubricationPoint", entityId: point.id, description: `Ponto de lubrificacao ${point.code} cadastrado` });
  res.status(201).json(point);
});

export const updateLubricationPoint = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = pointSchema.partial().parse(req.body);
  const existing = await prisma.lubricationPoint.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ponto de lubrificacao");
  assertOwnClient(req, existing.clientId);
  await assertRefsDoPonto(existing.clientId, data);

  const { clientId: _ignorado, ...resto } = data;
  const frequencyDays = resto.frequencyDays ?? existing.frequencyDays;
  const lastLubricatedAt = resto.lastLubricatedAt !== undefined ? resto.lastLubricatedAt : existing.lastLubricatedAt;

  const point = await prisma.lubricationPoint.update({
    where: { id: existing.id },
    data: { ...resto, nextDueAt: proximaAplicacao(lastLubricatedAt, frequencyDays) },
    include: pointInclude,
  });
  res.json(point);
});

export const deleteLubricationPoint = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.lubricationPoint.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Ponto de lubrificacao");
  assertOwnClient(req, existing.clientId);
  await prisma.lubricationPoint.update({ where: { id: existing.id }, data: { deletedAt: new Date(), active: false } });

  // Removido o ultimo ponto, o ativo volta para a fila: um ativo lubrificavel sem nenhum
  // ponto nao pode continuar marcado como concluido.
  const restantes = await prisma.lubricationPoint.count({
    where: { instrumentId: existing.instrumentId, deletedAt: null, active: true },
  });
  if (restantes === 0) {
    await prisma.instrument.updateMany({
      where: { id: existing.instrumentId, lubricationPointsComplete: true },
      data: { lubricationPointsComplete: false },
    });
  }

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Registro de aplicacao (o que fecha o ciclo: baixa o estoque e reprograma o ponto)
// ---------------------------------------------------------------------------

const recordSchema = z.object({
  quantity: z.coerce.number().positive("Informe a quantidade aplicada."),
  // Pode ser outro que o especificado (faltou o certo) - por isso e' informavel.
  lubricantId: z.string().uuid().optional(),
  executedAt: z.coerce.date().optional(),
  laborResourceId: z.string().uuid().nullish(),
  workOrderId: z.string().uuid().nullish(),
  conditionBefore: z.nativeEnum(LubricationCondition).nullish(),
  conditionAfter: z.nativeEnum(LubricationCondition).nullish(),
  notes: z.string().nullish(),
});

export const createLubricationRecord = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = recordSchema.parse(req.body);
  const point = await prisma.lubricationPoint.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { lubricant: { include: { sparePart: { select: { id: true, name: true, stockQty: true, unit: true } } } } },
  });
  if (!point) throw new NotFoundError("Ponto de lubrificacao");
  assertOwnClient(req, point.clientId);

  const lubricantId = data.lubricantId ?? point.lubricantId;
  const lubricante =
    lubricantId === point.lubricantId
      ? point.lubricant
      : await prisma.lubricant.findFirst({ where: { id: lubricantId, deletedAt: null }, include: { sparePart: { select: { id: true, name: true, stockQty: true, unit: true } } } });
  if (!lubricante) throw new NotFoundError("Lubrificante");
  if (lubricante.clientId !== point.clientId) throw new ValidationError("Esse lubrificante e' de outra empresa.");

  const executedAt = data.executedAt ?? new Date();

  // O lubrificador nao tira do almoxarifado a cada aplicacao - ele tira a embalagem
  // fechada (ex.: 1,8 kg) e vai usando aos poucos ao longo do mes. So' baixa o estoque
  // (SparePart.stockQty, contado em embalagens) quando falta saldo na embalagem ja aberta
  // e uma nova precisa ser retirada; o resto do tempo, a aplicacao so' desconta do saldo
  // guardado no proprio Lubricant. Sem packageSize cadastrado, mantem o comportamento
  // antigo (baixa direta por aplicacao) - caso do lubrificante dispensado de um tambor/
  // reservatorio, sem embalagem individual para abrir.
  let movementId: string | null = null;
  if (lubricante.packageSize != null) {
    let saldo = lubricante.openPackageRemaining ?? 0;
    let abriuNovaEmbalagem = false;
    if (saldo < data.quantity) {
      const movement = await applySparePartMovement({
        sparePartId: lubricante.sparePartId,
        type: "OUT",
        quantity: 1,
        reason: `Embalagem aberta para lubrificacao do ponto ${point.code} (${point.name})`,
        maintenanceWorkOrderId: data.workOrderId ?? null,
        createdById: req.user?.sub,
      });
      movementId = movement.id;
      abriuNovaEmbalagem = true;
      saldo += lubricante.packageSize;
      if (saldo < data.quantity) {
        throw new ValidationError(
          `A quantidade aplicada (${data.quantity}) e' maior que uma embalagem inteira (${lubricante.packageSize}). Confira a quantidade.`,
        );
      }
    }
    saldo -= data.quantity;
    await prisma.lubricant.update({
      where: { id: lubricante.id },
      data: { openPackageRemaining: saldo, ...(abriuNovaEmbalagem ? { openPackageOpenedAt: executedAt } : {}) },
    });
  } else {
    // Aplicar e consumir sao o mesmo evento: a baixa no almoxarifado sai junto do registro,
    // e nao num lancamento manual que alguem teria que lembrar de fazer depois.
    const movement = await applySparePartMovement({
      sparePartId: lubricante.sparePartId,
      type: "OUT",
      quantity: data.quantity,
      reason: `Lubrificacao do ponto ${point.code} (${point.name})`,
      maintenanceWorkOrderId: data.workOrderId ?? null,
      createdById: req.user?.sub,
    });
    movementId = movement.id;
  }

  const record = await prisma.lubricationRecord.create({
    data: {
      clientId: point.clientId,
      pointId: point.id,
      lubricantId,
      workOrderId: data.workOrderId ?? null,
      quantity: data.quantity,
      executedAt,
      laborResourceId: data.laborResourceId ?? null,
      conditionBefore: data.conditionBefore ?? null,
      conditionAfter: data.conditionAfter ?? null,
      notes: data.notes ?? null,
      movementId,
      createdById: req.user?.sub,
    },
    include: { lubricant: { include: lubricantInclude }, laborResource: { select: { id: true, name: true } } },
  });

  // Aplicou: o ponto reprograma a partir desta data.
  await prisma.lubricationPoint.update({
    where: { id: point.id },
    data: { lastLubricatedAt: executedAt, nextDueAt: somaDias(executedAt, point.frequencyDays) },
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "LubricationRecord",
    entityId: record.id,
    description: `Lubrificacao do ponto ${point.code}: ${data.quantity} ${lubricante.sparePart.unit}`,
  });

  res.status(201).json(record);
});

export const listLubricationRecords = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, pointId, lubricantId, dateFrom, dateTo } = req.query as {
    clientId?: string; pointId?: string; lubricantId?: string; dateFrom?: string; dateTo?: string;
  };

  const where = {
    ...resolveClientScope(req, clientId),
    ...(pointId ? { pointId } : {}),
    ...(lubricantId ? { lubricantId } : {}),
    ...(dateFrom || dateTo
      ? { executedAt: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lubricationRecord.findMany({
      where,
      orderBy: { executedAt: "desc" },
      ...toSkipTake(pageParams),
      include: {
        point: { select: { id: true, code: true, name: true, instrument: { select: { id: true, tag: true } } } },
        lubricant: { include: lubricantInclude },
        laborResource: { select: { id: true, name: true } },
        workOrder: { select: { id: true, number: true } },
      },
    }),
    prisma.lubricationRecord.count({ where }),
  ]);
  res.json(buildPagedResult(items, total, pageParams));
});

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

const routeSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(2, "Informe o nome da rota."),
  code: z.string().nullish(),
  plantId: z.string().uuid().nullish(),
  areaId: z.string().uuid().nullish(),
  responsibleId: z.string().uuid().nullish(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
  pointIds: z.array(z.string().uuid()).optional(),
});

const routeInclude = {
  plant: { select: { id: true, name: true } },
  area: { select: { id: true, name: true } },
  responsible: { select: { id: true, name: true, type: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { point: { include: pointInclude } },
  },
} as const;

export const listLubricationRoutes = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, active } = req.query as { clientId?: string; active?: string };
  const routes = await prisma.lubricationRoute.findMany({
    where: {
      deletedAt: null,
      ...resolveClientScope(req, clientId),
      ...(active !== undefined ? { active: active === "true" } : {}),
    },
    include: routeInclude,
    orderBy: { name: "asc" },
  });
  res.json(routes);
});

export const getLubricationRoute = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const route = await prisma.lubricationRoute.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: routeInclude,
  });
  if (!route) throw new NotFoundError("Rota de lubrificacao");
  res.json(route);
});

/** Os pontos da rota tem que ser da mesma empresa - senao a rota levaria o lubrificador a
 * um equipamento de outro cliente. */
async function assertPontosDoCliente(clientId: string, pointIds: string[]) {
  if (pointIds.length === 0) return;
  const encontrados = await prisma.lubricationPoint.findMany({ where: { id: { in: pointIds }, deletedAt: null }, select: { id: true, clientId: true } });
  if (encontrados.length !== pointIds.length) throw new NotFoundError("Ponto de lubrificacao");
  if (encontrados.some((p) => p.clientId !== clientId)) throw new ValidationError("Ha ponto de outra empresa na rota.");
}

export const createLubricationRoute = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { pointIds = [], ...data } = routeSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);
  await assertPontosDoCliente(clientId, pointIds);

  const route = await prisma.lubricationRoute.create({
    data: {
      ...data,
      clientId,
      createdById: req.user?.sub,
      items: { create: pointIds.map((pointId, i) => ({ pointId, sortOrder: i })) },
    },
    include: routeInclude,
  });
  await writeAuditLog({ userId: req.user?.sub, action: "CREATE", entityType: "LubricationRoute", entityId: route.id, description: `Rota de lubrificacao ${route.name} criada` });
  res.status(201).json(route);
});

export const updateLubricationRoute = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { pointIds, clientId: _ignorado, ...data } = routeSchema.partial().parse(req.body);
  const existing = await prisma.lubricationRoute.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Rota de lubrificacao");
  assertOwnClient(req, existing.clientId);

  if (pointIds) {
    await assertPontosDoCliente(existing.clientId, pointIds);
    await prisma.lubricationRouteItem.deleteMany({ where: { routeId: existing.id } });
  }

  const route = await prisma.lubricationRoute.update({
    where: { id: existing.id },
    data: {
      ...data,
      ...(pointIds ? { items: { create: pointIds.map((pointId, i) => ({ pointId, sortOrder: i })) } } : {}),
    },
    include: routeInclude,
  });
  res.json(route);
});

export const deleteLubricationRoute = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.lubricationRoute.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Rota de lubrificacao");
  assertOwnClient(req, existing.clientId);
  await prisma.lubricationRoute.update({ where: { id: existing.id }, data: { deletedAt: new Date(), active: false } });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// Montagem automatica da rota
//
// A montagem manual (escolher ponto a ponto) ja existe no cadastro da rota. Esta e' a
// segunda opcao: sugerir os pontos automaticamente por um criterio, para so revisar e
// confirmar - sem precisar catar ponto por ponto quando o motivo de agrupar e' obvio
// (todos vencem na mesma semana, todos ficam na mesma area, ou a maquina esta parada
// agora, que e' a janela mais barata pra lubrificar sem perder producao).
// ---------------------------------------------------------------------------

const CRITERIOS_DE_SUGESTAO = ["VENCIMENTO", "AREA", "PARADO"] as const;

/** Client-scoped (nao pende de uma rota ja salva) para funcionar tanto montando uma rota
 * nova quanto editando uma existente - a rota so existe de verdade depois do primeiro
 * "Salvar", e a montagem automatica precisa estar disponivel antes disso tambem. */
export const sugerirPontosDeLubrificacao = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, criterio, dataReferencia, areaId } = req.query as {
    clientId?: string; criterio?: string; dataReferencia?: string; areaId?: string;
  };
  const scope = resolveClientScope(req, clientId);
  if (!("clientId" in scope)) throw new ValidationError("Informe o cliente para sugerir pontos.");

  if (!criterio || !CRITERIOS_DE_SUGESTAO.includes(criterio as (typeof CRITERIOS_DE_SUGESTAO)[number])) {
    throw new ValidationError(`Criterio invalido. Use um de: ${CRITERIOS_DE_SUGESTAO.join(", ")}.`);
  }

  const baseWhere = { ...scope, active: true, deletedAt: null } as const;

  let where: Record<string, unknown>;
  if (criterio === "VENCIMENTO") {
    // A janela e' fixa em 5 dias pra cada lado: junta quem vence perto o bastante pra
    // valer uma volta so, sem esperar o restante da fabrica vencer junto.
    const referencia = dataReferencia ? new Date(dataReferencia) : new Date();
    if (Number.isNaN(referencia.getTime())) throw new ValidationError("Data de referencia invalida.");
    const de = somaDias(referencia, -5);
    const ate = somaDias(referencia, 5);
    where = { ...baseWhere, nextDueAt: { gte: de, lte: ate } };
  } else if (criterio === "AREA") {
    if (!areaId) throw new ValidationError("Informe a area para sugerir por area.");
    where = { ...baseWhere, instrument: { areaId } };
  } else {
    // PARADO: a janela mais barata pra lubrificar e' quando a maquina ja esta sem
    // produzir - nao e' preciso programar parada so pra isso.
    where = { ...baseWhere, instrument: { operationalStatus: "STOPPED" } };
  }

  const pontos = await prisma.lubricationPoint.findMany({
    where,
    include: pointInclude,
    orderBy: { code: "asc" },
  });
  res.json(pontos);
});

// ---------------------------------------------------------------------------
// OS de lubrificacao gerada a partir da rota
//
// Uma OS so sabe apontar para um ativo; uma rota normalmente cobre varios. Por isso
// "Gerar OS" cria uma OS por ativo coberto pela rota, cada uma com um item de checklist
// por ponto daquele ativo - e' o que da acompanhamento e rastreio a volta inteira, sem
// forcar a rota inteira dentro de uma OS so.
// ---------------------------------------------------------------------------

export const gerarOrdensDaRota = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const route = await prisma.lubricationRoute.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          point: {
            include: {
              instrument: { select: { id: true, tag: true, description: true, costCenterId: true } },
              lubricant: { include: { sparePart: { select: { name: true, unit: true } } } },
            },
          },
        },
      },
    },
  });
  if (!route) throw new NotFoundError("Rota de lubrificacao");
  if (route.items.length === 0) throw new ValidationError("Esta rota ainda nao tem pontos - monte a rota antes de gerar a OS.");

  const porAtivo = new Map<string, typeof route.items>();
  for (const item of route.items) {
    const lista = porAtivo.get(item.point.instrumentId) ?? [];
    lista.push(item);
    porAtivo.set(item.point.instrumentId, lista);
  }

  const geradas: { instrumentId: string; tag: string | null; number: string; workOrderId: string }[] = [];
  const puladas: { instrumentId: string; tag: string | null; motivo: string }[] = [];

  for (const [instrumentId, itens] of porAtivo) {
    const tag = itens[0].point.instrument.tag;

    // Uma OS de lubrificacao aberta por ativo, por rota, de cada vez - clicar "Gerar OS"
    // de novo antes de terminar a volta anterior nao duplica, so avisa qual ja existe.
    const aberta = await prisma.maintenanceWorkOrder.findFirst({
      where: { instrumentId, lubricationRouteId: route.id, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELED"] } },
      select: { number: true },
    });
    if (aberta) {
      puladas.push({ instrumentId, tag, motivo: `Ja existe a OS ${aberta.number} aberta para este ativo, nesta rota.` });
      continue;
    }

    const number = await nextClientMaintenanceOrderNumber(route.clientId);
    const workOrder = await prisma.maintenanceWorkOrder.create({
      data: {
        number,
        clientId: route.clientId,
        instrumentId,
        type: "LUBRICATION",
        status: "PROGRAMMED",
        priority: "MEDIUM",
        lubricationRouteId: route.id,
        title: `Rota de lubrificacao - ${route.name}`,
        description: `Pontos da rota "${route.name}" neste ativo.`,
        costCenterId: itens[0].point.instrument.costCenterId ?? null,
        technicianId: null,
        assignedResourceId: route.responsibleId,
        createdById: req.user?.sub,
        checklist: {
          create: itens.map((item, i) => ({
            description: `${item.point.name} (${item.point.code}) - ${item.point.lubricant.sparePart.name}, ${item.point.quantityPerApplication} ${item.point.lubricant.sparePart.unit}`,
            sortOrder: i,
            responseType: "YES_NO_NA",
            required: true,
          })),
        },
      },
    });
    geradas.push({ instrumentId, tag, number: workOrder.number, workOrderId: workOrder.id });
  }

  if (geradas.length > 0) {
    await writeAuditLog({
      userId: req.user?.sub,
      action: "CREATE",
      entityType: "LubricationRoute",
      entityId: route.id,
      description: `OS geradas a partir da rota ${route.name}: ${geradas.map((g) => g.number).join(", ")}`,
    });
  }

  res.status(201).json({ geradas, puladas });
});

// ---------------------------------------------------------------------------
// Previsao de consumo
// ---------------------------------------------------------------------------

/** Quantas aplicacoes um ponto tem dentro da janela pedida.
 *
 * Conta os vencimentos de verdade (a partir do proximo, somando a periodicidade), em vez
 * de dividir o periodo pela frequencia: um ponto que vence daqui a 25 dias nao consome
 * nada num periodo de 20 dias, e a divisao simples diria que consome. */
function aplicacoesNoPeriodo(nextDueAt: Date | null, frequencyDays: number, de: Date, ate: Date): number {
  if (frequencyDays <= 0) return 0;
  let vencimento = nextDueAt ?? de;
  // Ponto ja vencido antes da janela: a aplicacao atrasada e' feita dentro dela.
  if (vencimento < de) vencimento = de;

  let n = 0;
  // Teto defensivo: janelas absurdas com periodicidade diaria nao podem virar loop infinito.
  while (vencimento <= ate && n < 10000) {
    n += 1;
    vencimento = somaDias(vencimento, frequencyDays);
  }
  return n;
}

export const getLubricationForecast = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId, dateFrom, dateTo } = req.query as { clientId?: string; dateFrom?: string; dateTo?: string };

  // "De 01/09 a 30/11" inclui o dia 30 inteiro. Sem isso, uma data sem hora vira meia-noite
  // e o ultimo dia do periodo fica de fora - some uma aplicacao de cada ponto que vence
  // justamente nele.
  const de = dateFrom ? new Date(dateFrom) : new Date();
  de.setHours(0, 0, 0, 0);
  const ate = dateTo ? new Date(dateTo) : somaDias(de, 90);
  ate.setHours(23, 59, 59, 999);
  if (ate < de) throw new ValidationError("A data final da previsao nao pode ser antes da inicial.");

  const pontos = await prisma.lubricationPoint.findMany({
    where: { deletedAt: null, active: true, ...resolveClientScope(req, clientId) },
    include: {
      lubricant: { include: lubricantInclude },
      instrument: { select: { id: true, tag: true, area: { select: { id: true, name: true } } } },
    },
  });

  type Linha = {
    lubricantId: string;
    nome: string;
    codigo: string | null;
    unidade: string;
    especificacao: string | null;
    consumoPrevisto: number;
    aplicacoes: number;
    pontos: number;
    saldoAtual: number;
    estoqueMinimo: number;
    // Quanto falta comprar para atender o periodo sem furar o minimo.
    aComprar: number;
    // Em quantos dias o saldo acaba no ritmo previsto - null quando nao ha consumo previsto.
    diasDeCobertura: number | null;
    // Presente so' quando o lubrificante e' rastreado por embalagem - "a comprar" em kg/L
    // nao e' uma decisao de compra direta (nao se compra 2,3 kg avulso), embalagem fechada e'.
    packageSize: number | null;
    embalagensACobrar: number | null;
  };

  const porLubrificante = new Map<string, Linha>();
  const detalhePorPonto: {
    pointId: string; code: string; name: string; instrumentTag: string | null; area: string | null;
    lubricante: string; aplicacoes: number; consumoPrevisto: number; unidade: string;
  }[] = [];

  for (const ponto of pontos) {
    const aplicacoes = aplicacoesNoPeriodo(ponto.nextDueAt, ponto.frequencyDays, de, ate);
    const consumo = aplicacoes * ponto.quantityPerApplication;
    const lub = ponto.lubricant;

    detalhePorPonto.push({
      pointId: ponto.id,
      code: ponto.code,
      name: ponto.name,
      instrumentTag: ponto.instrument?.tag ?? null,
      area: ponto.instrument?.area?.name ?? null,
      lubricante: lub.sparePart.name,
      aplicacoes,
      consumoPrevisto: consumo,
      unidade: lub.sparePart.unit,
    });

    const atual = porLubrificante.get(lub.id);
    if (atual) {
      atual.consumoPrevisto += consumo;
      atual.aplicacoes += aplicacoes;
      atual.pontos += 1;
    } else {
      // Com embalagem rastreada, o consumo previsto e' calculado no conteudo (kg/L) da
      // aplicacao, mas o saldo em estoque conta EMBALAGENS FECHADAS - comparar os dois sem
      // converter compararia coisas diferentes (achado ao revisar a previsao depois de
      // separar embalagem fechada de saldo em uso). O saldo disponivel de verdade tambem
      // inclui o que ja sobrou na embalagem aberta, que nao aparece no estoque.
      const saldoAtual =
        lub.packageSize != null
          ? lub.sparePart.stockQty * lub.packageSize + (lub.openPackageRemaining ?? 0)
          : lub.sparePart.stockQty;
      const estoqueMinimo = lub.packageSize != null ? lub.sparePart.minStock * lub.packageSize : lub.sparePart.minStock;
      porLubrificante.set(lub.id, {
        lubricantId: lub.id,
        nome: lub.sparePart.name,
        codigo: lub.sparePart.code,
        unidade: lub.sparePart.unit,
        especificacao: lub.specification,
        consumoPrevisto: consumo,
        aplicacoes,
        pontos: 1,
        saldoAtual,
        estoqueMinimo,
        aComprar: 0,
        diasDeCobertura: null,
        packageSize: lub.packageSize,
        embalagensACobrar: null,
      });
    }
  }

  const diasDaJanela = Math.max(1, Math.round((ate.getTime() - de.getTime()) / UM_DIA));
  const itens = [...porLubrificante.values()].map((linha) => {
    const faltando = linha.consumoPrevisto + linha.estoqueMinimo - linha.saldoAtual;
    const consumoDiario = linha.consumoPrevisto / diasDaJanela;
    const aComprar = faltando > 0 ? Number(faltando.toFixed(3)) : 0;
    return {
      ...linha,
      aComprar,
      consumoPrevisto: Number(linha.consumoPrevisto.toFixed(3)),
      saldoAtual: Number(linha.saldoAtual.toFixed(3)),
      estoqueMinimo: Number(linha.estoqueMinimo.toFixed(3)),
      diasDeCobertura: consumoDiario > 0 ? Math.floor(linha.saldoAtual / consumoDiario) : null,
      embalagensACobrar: linha.packageSize != null && aComprar > 0 ? Math.ceil(aComprar / linha.packageSize) : null,
    };
  });
  itens.sort((a, b) => b.consumoPrevisto - a.consumoPrevisto);

  res.json({
    periodo: { de, ate, dias: diasDaJanela },
    itens,
    detalhePorPonto: detalhePorPonto.sort((a, b) => b.consumoPrevisto - a.consumoPrevisto),
    totais: {
      pontosConsiderados: pontos.length,
      lubrificantes: itens.length,
      aplicacoesPrevistas: itens.reduce((s, i) => s + i.aplicacoes, 0),
      itensAComprar: itens.filter((i) => i.aComprar > 0).length,
    },
  });
});

export const getLubricationDashboard = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId } = req.query as { clientId?: string };
  const hoje = new Date();
  const escopo = { deletedAt: null, active: true, ...resolveClientScope(req, clientId) };

  const [total, vencidos, proximos, rotas, ultimos30, pendentes] = await Promise.all([
    prisma.lubricationPoint.count({ where: escopo }),
    prisma.lubricationPoint.count({ where: { ...escopo, nextDueAt: { lt: hoje } } }),
    prisma.lubricationPoint.count({ where: { ...escopo, nextDueAt: { gte: hoje, lte: somaDias(hoje, 7) } } }),
    prisma.lubricationRoute.count({ where: { deletedAt: null, active: true, ...resolveClientScope(req, clientId) } }),
    prisma.lubricationRecord.count({
      where: { ...resolveClientScope(req, clientId), executedAt: { gte: somaDias(hoje, -30) } },
    }),
    // Ativo marcado como lubrificavel e sem ponto: nao aparece em rota nenhuma, entao a
    // falta dele e' silenciosa. Fica no painel para nao depender de alguem abrir a ficha.
    prisma.instrument.count({
      where: {
        deletedAt: null,
        lubricatable: true,
        lubricationPointsComplete: false,
        ...resolveClientScope(req, clientId),
      },
    }),
  ]);

  // Pontos vencidos ha mais tempo primeiro: e' por onde o lubrificador comeca o dia.
  const atrasados = await prisma.lubricationPoint.findMany({
    where: { ...escopo, nextDueAt: { lt: hoje } },
    include: pointInclude,
    orderBy: { nextDueAt: "asc" },
    take: 20,
  });

  res.json({
    totais: { pontos: total, vencidos, proximos7Dias: proximos, rotas, aplicacoes30Dias: ultimos30, pendentesDeCadastro: pendentes },
    // Aderencia so faz sentido com pontos cadastrados; sem eles, null (e nao 100%).
    aderenciaPct: total > 0 ? Number((((total - vencidos) / total) * 100).toFixed(1)) : null,
    atrasados,
  });
});

/**
 * Ativos marcados como lubrificaveis que ainda nao tem ponto cadastrado.
 *
 * Com dezenas de pontos, o aviso na ficha de cada ativo basta. Com dois mil, ninguem abre
 * ficha por ficha para descobrir o que ficou pela metade - e um ponto que nunca foi
 * cadastrado nao aparece em rota nenhuma, entao a falha e' silenciosa: a maquina
 * simplesmente nunca e' lubrificada, e nada na tela denuncia isso. Esta lista e' a fila
 * de trabalho de quem esta montando o plano de lubrificacao.
 */
export const listPendingLubricationPoints = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, plantId, areaId, search } = req.query as {
    clientId?: string; plantId?: string; areaId?: string; search?: string;
  };

  const where = {
    deletedAt: null,
    lubricatable: true,
    // Sai da fila quando ALGUEM DIZ que acabou, nao quando aparece o primeiro ponto: um
    // motor tem mancal LA, mancal LOA e acoplamento, e cadastrar so o primeiro deixava os
    // outros dois para tras sem nada avisar.
    lubricationPointsComplete: false,
    ...resolveClientScope(req, clientId),
    ...(plantId ? { plantId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(search
      ? {
          OR: [
            { tag: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.instrument.findMany({
      where,
      orderBy: [{ plant: { name: "asc" } }, { area: { name: "asc" } }, { tag: "asc" }],
      ...toSkipTake(pageParams),
      select: {
        id: true,
        tag: true,
        description: true,
        type: true,
        criticality: true,
        plant: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
        parent: { select: { id: true, tag: true, description: true } },
        _count: { select: { lubricationPoints: { where: { deletedAt: null, active: true } } } },
      },
    }),
    prisma.instrument.count({ where }),
  ]);

  // "0 pontos" e "2 pontos, falta confirmar" sao situacoes diferentes na hora de decidir
  // por onde comecar - a tela mostra as duas.
  const comContagem = items.map(({ _count, ...ativo }) => ({ ...ativo, pontosCadastrados: _count.lubricationPoints }));
  res.json(buildPagedResult(comContagem, total, pageParams));
});

/**
 * Marca (ou desmarca) que a lista de pontos deste ativo esta completa - e' o que tira o
 * ativo da fila. So aceita concluir um ativo que ja tenha pelo menos um ponto: concluir
 * com zero seria o mesmo que dizer que a maquina nao precisa de lubrificacao, e para isso
 * existe desmarcar "lubrificavel" na ficha.
 */
export const setLubricationPointsComplete = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { concluido } = z.object({ concluido: z.boolean() }).parse(req.body);

  const ativo = await prisma.instrument.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!ativo) throw new NotFoundError("Ativo");
  assertOwnClient(req, ativo.clientId);

  if (concluido) {
    const pontos = await prisma.lubricationPoint.count({
      where: { instrumentId: ativo.id, deletedAt: null, active: true },
    });
    if (pontos === 0) {
      throw new ValidationError(
        "Este ativo ainda nao tem nenhum ponto. Cadastre os pontos, ou desmarque \"lubrificavel\" na ficha se ele nao precisa de lubrificacao.",
      );
    }
  }

  const atualizado = await prisma.instrument.update({
    where: { id: ativo.id },
    data: { lubricationPointsComplete: concluido },
    select: { id: true, tag: true, lubricationPointsComplete: true },
  });
  res.json(atualizado);
});
