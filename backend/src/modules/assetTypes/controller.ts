import type { Request, Response } from "express";
import { z } from "zod";
import { AssetHierarchyLevel } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError, ForbiddenError, ValidationError } from "../../utils/errors";
import { assertServiceAccess } from "../../middleware/rbac";

/** Um cliente enxerga o catalogo padrao da OptiProcess (clientId nulo) somado aos tipos
 * que ele mesmo cadastrou; a equipe interna enxerga tudo, opcionalmente filtrado. */
function scopeFilter(req: Request, clientId?: string) {
  if (req.user?.role === "CLIENT") {
    if (!req.user.clientId) throw new ForbiddenError();
    return { OR: [{ clientId: null }, { clientId: req.user.clientId }] };
  }
  if (clientId) return { OR: [{ clientId: null }, { clientId }] };
  return {};
}

/** A empresa pode ter cadastrado um nome que hoje tambem existe no catalogo padrao da
 * OptiProcess (foi o que aconteceu com "Tecnico mecanico": o campo era texto livre e
 * criou uma copia propria). Nesse caso a linha da empresa e' a que vale - ela e' quem
 * pode editar e desativar - e a padrao some, pra mesma funcao nao aparecer duas vezes
 * na lista de escolha. */
function semNomesRepetidos<T extends { name: string; clientId: string | null }>(itens: T[]): T[] {
  const daEmpresa = new Set(itens.filter((i) => i.clientId).map((i) => i.name.toLowerCase()));
  return itens.filter((i) => i.clientId || !daEmpresa.has(i.name.toLowerCase()));
}

export const listAssetTypes = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CALIBRATION", "CMMS_MAINTENANCE"]);
  const { active, clientId } = req.query as { active?: string; clientId?: string };
  const types = await prisma.assetType.findMany({
    where: {
      ...scopeFilter(req, clientId),
      ...(active !== undefined ? { active: active === "true" } : {}),
    },
    orderBy: { name: "asc" },
  });
  res.json(semNomesRepetidos(types));
});

const assetTypeSchema = z.object({
  name: z.string().min(2, "Informe o nome do tipo."),
  clientId: z.string().uuid().nullish(),
  // Nivel na hierarquia funcional (Planta/Area/Maquina/Subconjunto/Parte) - so pra arvore
  // de ativos escolher o icone certo. Opcional: tipos antigos (Motor, Compressor...) nao
  // precisam disso pra continuar funcionando.
  level: z.nativeEnum(AssetHierarchyLevel).nullish(),
  // Prefixo do codigo serializado (ex.: "MOT") - usado so' pelo cadastro de Equipamentos
  // recondicionaveis, pra sugerir o proximo codigo.
  codePrefix: z.string().trim().max(10).nullish(),
});

export const createAssetType = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CALIBRATION", "CMMS_MAINTENANCE"]);
  const data = assetTypeSchema.parse(req.body);
  if (req.user?.role === "CLIENT") {
    if (!req.user.clientId) throw new ForbiddenError();
    data.clientId = req.user.clientId;
  }

  const existing = await prisma.assetType.findFirst({
    where: { clientId: data.clientId ?? null, name: { equals: data.name, mode: "insensitive" } },
  });
  if (existing) {
    // Este catalogo nao tem exclusao logica: remover apaga de vez. Basta reativar.
    if (!existing.active) {
      const reactivated = await prisma.assetType.update({ where: { id: existing.id }, data: { active: true } });
      return res.status(200).json(reactivated);
    }
    throw new ValidationError(`O tipo "${data.name}" ja existe.`);
  }

  const type = await prisma.assetType.create({ data });
  return res.status(201).json(type);
});

const updateSchema = assetTypeSchema.partial().extend({ active: z.boolean().optional() });

export const updateAssetType = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CALIBRATION", "CMMS_MAINTENANCE"]);
  const data = updateSchema.parse(req.body);
  const existing = await prisma.assetType.findFirst({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError("Tipo de ativo");

  if (req.user?.role === "CLIENT") {
    if (existing.clientId !== req.user.clientId) {
      throw new ForbiddenError("Este tipo faz parte do catalogo padrao e nao pode ser alterado.");
    }
    delete data.clientId;
  }

  const type = await prisma.assetType.update({ where: { id: existing.id }, data });
  res.json(type);
});

export const deleteAssetType = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CALIBRATION", "CMMS_MAINTENANCE"]);
  const existing = await prisma.assetType.findFirst({ where: { id: req.params.id } });
  if (!existing) throw new NotFoundError("Tipo de ativo");

  if (req.user?.role === "CLIENT" && existing.clientId !== req.user.clientId) {
    throw new ForbiddenError("Este tipo faz parte do catalogo padrao e nao pode ser removido.");
  }

  // Ativo removido nao conta como uso: senao o tipo ficaria preso para sempre.
  const inUse = await prisma.instrument.count({ where: { type: { equals: existing.name, mode: "insensitive" }, deletedAt: null } });
  if (inUse > 0) throw new ValidationError("Este tipo ja esta em uso por algum ativo. Desative-o em vez de remover.");

  await prisma.assetType.delete({ where: { id: existing.id } });
  res.status(204).send();
});
