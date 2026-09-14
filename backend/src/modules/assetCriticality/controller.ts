import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { clientScopeFilter, resolveClientScope } from "../../middleware/rbac";
import { recalcularCriticidade } from "../../lib/assetCriticality";

/**
 * Criticidade de ativos: nota dinamica (Seguranca/Producao/Falhas) por local funcional -
 * ver comentario no schema.prisma (model AssetCriticality) para o raciocinio completo.
 */

const instrumentoResumo = { id: true, tag: true, description: true, type: true, plant: { select: { id: true, name: true } }, area: { select: { id: true, name: true } } } as const;

export const listCriticalities = asyncHandler(async (req: Request, res: Response) => {
  const { clientId: queryClientId, plantId, areaId, class: classe, search, insufficient } = req.query as {
    clientId?: string;
    plantId?: string;
    areaId?: string;
    class?: string;
    search?: string;
    insufficient?: string;
  };
  const escopo = resolveClientScope(req, queryClientId);
  const pageParams = parsePageParams(req.query);

  const where = {
    deletedAt: null,
    ...escopo,
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
    ...(insufficient === "true"
      ? { OR: [{ assetCriticality: null }, { assetCriticality: { is: { failureScore: null } } }] }
      : classe
        ? { assetCriticality: { is: { criticalityClass: classe as never } } }
        : {}),
  };

  const [items, total] = await Promise.all([
    prisma.instrument.findMany({
      where,
      select: { ...instrumentoResumo, assetCriticality: true },
      orderBy: [{ tag: "asc" }],
      ...toSkipTake(pageParams),
    }),
    prisma.instrument.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});

/** Contagem por classe pros cards do topo - sempre no escopo inteiro do cliente, sem os
 * filtros da tabela (senao os proprios cards mudariam de numero ao filtrar, confundindo
 * "quantos ao todo" com "quantos aparecem agora"). */
export const getCriticalitySummary = asyncHandler(async (req: Request, res: Response) => {
  const { clientId: queryClientId } = req.query as { clientId?: string };
  const escopo = resolveClientScope(req, queryClientId);
  const where = { deletedAt: null, ...escopo };

  const [total, a, b, c] = await Promise.all([
    prisma.instrument.count({ where }),
    prisma.instrument.count({ where: { ...where, assetCriticality: { is: { criticalityClass: "A" } } } }),
    prisma.instrument.count({ where: { ...where, assetCriticality: { is: { criticalityClass: "B" } } } }),
    prisma.instrument.count({ where: { ...where, assetCriticality: { is: { criticalityClass: "C" } } } }),
  ]);

  res.json({ classA: a, classB: b, classC: c, insufficient: total - a - b - c, total });
});

export const getCriticality = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.instrumentId, deletedAt: null, ...clientScopeFilter(req) },
    select: { ...instrumentoResumo, status: true, operationalStatus: true },
  });
  if (!instrument) throw new NotFoundError("Ativo");

  let criticidade = await prisma.assetCriticality.findUnique({
    where: { instrumentId: instrument.id },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 30, include: { responsible: { select: { id: true, name: true } } } } },
  });
  // Primeira visita a este ativo: calcula na hora em vez de mostrar tela vazia - assim a
  // pessoa ja ve o que da pra saber (ou "Dados insuficientes") sem precisar clicar em nada.
  if (!criticidade) {
    await recalcularCriticidade(instrument.id, "INITIAL");
    criticidade = await prisma.assetCriticality.findUnique({
      where: { instrumentId: instrument.id },
      include: { logs: { orderBy: { createdAt: "desc" }, take: 30, include: { responsible: { select: { id: true, name: true } } } } },
    });
  }

  res.json({ instrument, criticality: criticidade });
});

const revisaoSchema = z
  .object({
    safetyScore: z.number().int().min(1).max(5).optional(),
    safetyNotes: z.string().nullish(),
    productionScore: z.number().int().min(1).max(5).optional(),
    productionNotes: z.string().nullish(),
    // "AUTO" volta o calculo automatico a mandar em Q; "MANUAL" exige failureScore + reason.
    failureScoreMode: z.enum(["AUTO", "MANUAL"]).optional(),
    failureScore: z.number().int().min(1).max(5).nullish(),
    reason: z.string().min(3, "Explique o motivo da revisao.").optional(),
  })
  .refine((d) => d.failureScoreMode !== "MANUAL" || (d.failureScore != null && d.reason), {
    message: "Informe a nota de falha e o motivo pra sobrescrever o calculo automatico.",
  });

/** Revisao manual de S/P (sempre manual) e, opcionalmente, sobrescrita de Q. Qualquer
 * campo tocado aqui conta como MANUAL_REVIEW no historico. */
export const reviewCriticality = asyncHandler(async (req: Request, res: Response) => {
  const data = revisaoSchema.parse(req.body);
  const instrument = await prisma.instrument.findFirst({ where: { id: req.params.instrumentId, deletedAt: null, ...clientScopeFilter(req) } });
  if (!instrument) throw new NotFoundError("Ativo");

  const existente = await prisma.assetCriticality.findUnique({ where: { instrumentId: instrument.id } });
  const agora = new Date();

  const safetyScore = data.safetyScore ?? existente?.safetyScore ?? 1;
  const productionScore = data.productionScore ?? existente?.productionScore ?? 1;
  const consequenceScore = Math.max(safetyScore, productionScore);

  let failureScore = existente?.failureScore ?? null;
  let failureScoreOrigin: "AUTO" | "MANUAL" = existente?.failureScoreOrigin ?? "AUTO";
  let failureOverrideReason = existente?.failureOverrideReason ?? null;
  let failureOverrideAt = existente?.failureOverrideAt ?? null;

  if (data.failureScoreMode === "MANUAL") {
    failureScore = data.failureScore!;
    failureScoreOrigin = "MANUAL";
    failureOverrideReason = data.reason!;
    failureOverrideAt = agora;
  } else if (data.failureScoreMode === "AUTO") {
    failureScoreOrigin = "AUTO";
    failureOverrideReason = null;
    failureOverrideAt = null;
    // Volta a valer o que o calculo automatico diria agora - recalcula de verdade
    // (nao so limpa a flag) pra Q nao ficar preso no ultimo valor manual.
  }

  let criticalityIndex: number | null = null;
  if (failureScoreOrigin === "MANUAL" && failureScore != null) {
    criticalityIndex = 4 * consequenceScore * failureScore;
  }
  // Mesma regra independente de Q usada em recalcularCriticidade: Seguranca 4/5 ou Producao
  // 5 e' Classe A mesmo sem indice calculado (Q ainda MANUAL sem nota, ou sem historico).
  const criticalityClass: "A" | "B" | "C" | null =
    safetyScore >= 4 || productionScore === 5
      ? "A"
      : criticalityIndex != null
        ? criticalityIndex >= 60 ? "A" : criticalityIndex >= 25 ? "B" : "C"
        : null;

  await prisma.assetCriticality.upsert({
    where: { instrumentId: instrument.id },
    create: {
      instrumentId: instrument.id,
      clientId: instrument.clientId,
      safetyScore,
      safetyNotes: data.safetyNotes ?? null,
      safetyUpdatedAt: data.safetyScore != null ? agora : null,
      productionScore,
      productionNotes: data.productionNotes ?? null,
      productionUpdatedAt: data.productionScore != null ? agora : null,
      failureScore,
      failureScoreOrigin,
      failureOverrideReason,
      failureOverrideAt,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
    },
    update: {
      safetyScore,
      ...(data.safetyNotes !== undefined ? { safetyNotes: data.safetyNotes } : {}),
      ...(data.safetyScore != null ? { safetyUpdatedAt: agora } : {}),
      productionScore,
      ...(data.productionNotes !== undefined ? { productionNotes: data.productionNotes } : {}),
      ...(data.productionScore != null ? { productionUpdatedAt: agora } : {}),
      failureScore,
      failureScoreOrigin,
      failureOverrideReason,
      failureOverrideAt,
      consequenceScore,
      ...(failureScoreOrigin === "MANUAL" ? { criticalityIndex, criticalityClass } : {}),
    },
  });

  // AUTO: refaz a conta de verdade (cobre tanto "acabou de voltar a automatico" quanto
  // qualquer revisao de S/P, que muda C e portanto o indice mesmo com Q automatico).
  if (failureScoreOrigin === "AUTO") {
    await recalcularCriticidade(instrument.id, "MANUAL_REVIEW", { responsibleId: req.user?.sub, reason: data.reason });
  } else {
    const salvo = await prisma.assetCriticality.findUniqueOrThrow({ where: { instrumentId: instrument.id } });
    await prisma.assetCriticalityLog.create({
      data: {
        criticalityId: salvo.id,
        trigger: "MANUAL_REVIEW",
        origin: "MANUAL",
        safetyScore: salvo.safetyScore,
        productionScore: salvo.productionScore,
        failureScore: salvo.failureScore,
        criticalityIndex: salvo.criticalityIndex,
        criticalityClass: salvo.criticalityClass,
        reason: data.reason ?? null,
        responsibleId: req.user?.sub,
      },
    });
  }

  const atualizado = await prisma.assetCriticality.findUnique({
    where: { instrumentId: instrument.id },
    include: { logs: { orderBy: { createdAt: "desc" }, take: 30, include: { responsible: { select: { id: true, name: true } } } } },
  });
  res.json(atualizado);
});

/** Botao "Recalcular" - forca o recalculo agora (ex.: depois de corrigir um lancamento
 * antigo que nao passou pelos gatilhos automaticos). */
export const recalculateCriticality = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({ where: { id: req.params.instrumentId, deletedAt: null, ...clientScopeFilter(req) } });
  if (!instrument) throw new NotFoundError("Ativo");
  const atualizado = await recalcularCriticidade(instrument.id, "MANUAL_REVIEW", { responsibleId: req.user?.sub, reason: "Recalculo manual" });
  if (!atualizado) throw new ValidationError("Nao foi possivel recalcular.");
  res.json(atualizado);
});
