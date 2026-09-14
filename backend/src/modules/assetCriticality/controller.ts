import type { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { clientScopeFilter, resolveClientScope, resolveClientId } from "../../middleware/rbac";
import { recalcularCriticidade, resolverMtbfMeta, revisarCriticidade } from "../../lib/assetCriticality";
import { gerarPlanilhaCriticidade, lerPlanilhaCriticidade, type LinhaCriticidadeParaExportar } from "./spreadsheet";

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

  // MTBF-meta que esta valendo agora (propria, se definida, ou a media da familia) - so'
  // pra tela mostrar de onde saiu a razao usada no calculo, sem gravar nada.
  const mtbfTargetResolved = await resolverMtbfMeta(prisma, instrument.id, criticidade?.mtbfTargetHours);

  res.json({ instrument, criticality: criticidade, mtbfTargetResolved });
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
    // MTBF-meta proprio do ativo (horas). Nulo explicito limpa a meta propria e volta a usar
    // a media da familia; omitido (undefined) nao mexe no que ja esta gravado.
    mtbfTargetHours: z.number().positive().nullish(),
    reason: z.string().min(3, "Explique o motivo da revisao.").optional(),
  })
  .refine((d) => d.failureScoreMode !== "MANUAL" || (d.failureScore != null && d.reason), {
    message: "Informe a nota de falha e o motivo pra sobrescrever o calculo automatico.",
  });

/** Revisao manual de S/P (sempre manual) e, opcionalmente, do MTBF-meta e/ou sobrescrita de
 * Q. Qualquer campo tocado aqui conta como MANUAL_REVIEW no historico. */
export const reviewCriticality = asyncHandler(async (req: Request, res: Response) => {
  const data = revisaoSchema.parse(req.body);
  const instrument = await prisma.instrument.findFirst({ where: { id: req.params.instrumentId, deletedAt: null, ...clientScopeFilter(req) } });
  if (!instrument) throw new NotFoundError("Ativo");

  await revisarCriticidade(prisma, instrument.id, instrument.clientId, { ...data, responsibleId: req.user?.sub });

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

// ---------------------------------------------------------------------------
// Planilha: exportar todos os ativos (com o que ja esta calculado) e reimportar a revisao
// de Segurança/Produção/MTBF-meta em massa - a mesma logica de revisarCriticidade, so' que
// linha a linha, pra ser bem mais rapido que abrir ativo por ativo no sistema.
// ---------------------------------------------------------------------------

export const exportCriticalities = asyncHandler(async (req: Request, res: Response) => {
  const { clientId: queryClientId, plantId, areaId, class: classe, search, insufficient } = req.query as {
    clientId?: string;
    plantId?: string;
    areaId?: string;
    class?: string;
    search?: string;
    insufficient?: string;
  };
  const escopo = resolveClientScope(req, queryClientId);
  const alvo = queryClientId ?? resolveClientId(req);

  const where = {
    deletedAt: null,
    ...escopo,
    ...(plantId ? { plantId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(search
      ? { OR: [{ tag: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }] }
      : {}),
    ...(insufficient === "true"
      ? { OR: [{ assetCriticality: null }, { assetCriticality: { is: { failureScore: null } } }] }
      : classe
        ? { assetCriticality: { is: { criticalityClass: classe as never } } }
        : {}),
  };

  const [cliente, instrumentos] = await Promise.all([
    alvo ? prisma.client.findFirst({ where: { id: alvo }, select: { companyName: true } }) : Promise.resolve(null),
    prisma.instrument.findMany({
      where,
      select: { ...instrumentoResumo, assetCriticality: true },
      orderBy: [{ tag: "asc" }],
    }),
  ]);

  const linhas: LinhaCriticidadeParaExportar[] = instrumentos.map((i) => ({
    instrumentId: i.id,
    tag: i.tag,
    description: i.description,
    type: i.type,
    plantName: i.plant?.name ?? null,
    areaName: i.area?.name ?? null,
    safetyScore: i.assetCriticality?.safetyScore ?? 1,
    productionScore: i.assetCriticality?.productionScore ?? 1,
    mtbfTargetHours: i.assetCriticality?.mtbfTargetHours ?? null,
    mtbfHours: i.assetCriticality?.mtbfHours ?? null,
    failureCount12m: i.assetCriticality?.failureCount12m ?? null,
    failureScore: i.assetCriticality?.failureScore ?? null,
    criticalityIndex: i.assetCriticality?.criticalityIndex ?? null,
    criticalityClass: i.assetCriticality?.criticalityClass ?? null,
  }));

  const arquivo = await gerarPlanilhaCriticidade(cliente?.companyName, linhas);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="criticidade-de-ativos.xlsx"');
  res.end(arquivo);
});

interface ResultadoDaLinha {
  numero: number;
  tag: string;
  status: "alterado" | "sem_alteracao" | "erro";
  mensagem?: string;
  antes?: { safetyScore: number; productionScore: number; mtbfTargetHours: number | null };
  depois?: { safetyScore: number; productionScore: number; mtbfTargetHours: number | null };
}

/** Confere linha a linha o que mudaria - usado tanto na previa (simular) quanto, com
 * `aplicar: true`, na gravacao de verdade (confirmar). O calculo do que mudou e' sempre
 * feito contra o estado ATUAL do banco, nunca contra o que a planilha tinha quando foi
 * gerada - evita reaplicar um valor antigo por cima de uma edicao feita nesse meio tempo. */
async function processarPlanilha(req: Request, aplicar: boolean) {
  if (!req.file) throw new ValidationError("Selecione a planilha preenchida.");
  const linhas = await lerPlanilhaCriticidade(req.file.buffer);
  if (linhas.length === 0) throw new ValidationError("Planilha vazia ou fora do formato esperado (aba 'Ativos' nao encontrada).");

  const resultados: ResultadoDaLinha[] = [];

  for (const linha of linhas) {
    const instrument = await prisma.instrument.findFirst({
      where: { id: linha.instrumentId, deletedAt: null, ...clientScopeFilter(req) },
      select: { id: true, clientId: true, tag: true, type: true },
    });
    if (!instrument) {
      resultados.push({ numero: linha.numero, tag: linha.tag || linha.instrumentId, status: "erro", mensagem: "Ativo nao encontrado (ou fora do seu escopo)." });
      continue;
    }

    const existente = await prisma.assetCriticality.findUnique({ where: { instrumentId: instrument.id } });
    const safetyAtual = existente?.safetyScore ?? 1;
    const productionAtual = existente?.productionScore ?? 1;
    const mtbfMetaAtual = existente?.mtbfTargetHours ?? null;

    const novaSeguranca = linha.novaSeguranca ?? safetyAtual;
    const novaProducao = linha.novaProducao ?? productionAtual;
    // 0 na planilha e' o jeito de pedir "limpar a meta propria"; em branco nao mexe.
    const novoMtbfMeta = !linha.novoMtbfMetaInformado ? mtbfMetaAtual : linha.novoMtbfMeta === 0 ? null : linha.novoMtbfMeta;

    const mudouSeguranca = novaSeguranca !== safetyAtual;
    const mudouProducao = novaProducao !== productionAtual;
    const mudouMtbfMeta = linha.novoMtbfMetaInformado && novoMtbfMeta !== mtbfMetaAtual;
    const mudouAlgo = mudouSeguranca || mudouProducao || mudouMtbfMeta;

    if (!mudouAlgo) {
      resultados.push({ numero: linha.numero, tag: instrument.tag ?? linha.tag, status: "sem_alteracao" });
      continue;
    }
    if (!linha.motivo.trim()) {
      resultados.push({ numero: linha.numero, tag: instrument.tag ?? linha.tag, status: "erro", mensagem: "Linha alterada precisa do Motivo da revisao preenchido." });
      continue;
    }
    if (linha.novaSeguranca != null && (linha.novaSeguranca < 1 || linha.novaSeguranca > 5)) {
      resultados.push({ numero: linha.numero, tag: instrument.tag ?? linha.tag, status: "erro", mensagem: "Nova Segurança precisa ser de 1 a 5." });
      continue;
    }
    if (linha.novaProducao != null && (linha.novaProducao < 1 || linha.novaProducao > 5)) {
      resultados.push({ numero: linha.numero, tag: instrument.tag ?? linha.tag, status: "erro", mensagem: "Nova Produção precisa ser de 1 a 5." });
      continue;
    }

    resultados.push({
      numero: linha.numero,
      tag: instrument.tag ?? linha.tag,
      status: "alterado",
      antes: { safetyScore: safetyAtual, productionScore: productionAtual, mtbfTargetHours: mtbfMetaAtual },
      depois: { safetyScore: novaSeguranca, productionScore: novaProducao, mtbfTargetHours: novoMtbfMeta },
    });

    if (aplicar) {
      await revisarCriticidade(prisma, instrument.id, instrument.clientId, {
        safetyScore: novaSeguranca,
        productionScore: novaProducao,
        mtbfTargetHours: linha.novoMtbfMetaInformado ? novoMtbfMeta : undefined,
        reason: linha.motivo.trim(),
        responsibleId: req.user?.sub,
      });
    }
  }

  const resumo = {
    total: resultados.length,
    alterados: resultados.filter((r) => r.status === "alterado").length,
    semAlteracao: resultados.filter((r) => r.status === "sem_alteracao").length,
    comErro: resultados.filter((r) => r.status === "erro").length,
  };
  return { resumo, linhas: resultados };
}

export const simulateImportCriticalities = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await processarPlanilha(req, false);
  res.json(resultado);
});

export const confirmImportCriticalities = asyncHandler(async (req: Request, res: Response) => {
  const resultado = await processarPlanilha(req, true);
  res.json(resultado);
});
