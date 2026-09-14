import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { clientScopeFilter } from "../../middleware/rbac";
import { ForbiddenError } from "../../utils/errors";

export const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { entityType, entityId, userId } = req.query as { entityType?: string; entityId?: string; userId?: string };

  const where = {
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(userId ? { userId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});

/**
 * Auditoria do portal: so' o que a propria empresa fez. O AuditLog nao guarda clientId
 * direto (registra a acao, nao de quem e' o dado) - o escopo aqui e' por quem executou a
 * acao (user.clientId), nunca aceitando um clientId vindo da query, pra um cliente jamais
 * ver o rastro de outro. Acao sem usuario (job automatico) fica de fora: sem um userId pra
 * amarrar a empresa, mostrar seria arriscar vazar entre clientes.
 */
export const listOwnAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { entityType, entityId } = req.query as { entityType?: string; entityId?: string };

  const escopo = clientScopeFilter(req);
  if (!escopo.clientId) throw new ForbiddenError();

  const where = {
    user: { clientId: escopo.clientId },
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json(buildPagedResult(items, total, pageParams));
});
