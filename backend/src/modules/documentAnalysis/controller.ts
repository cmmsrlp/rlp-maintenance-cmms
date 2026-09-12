import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { getStorageProvider } from "../../lib/storage";
import { analisarLaudo } from "../../lib/ai";

export const listMyDocumentAnalyses = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.clientId) throw new ForbiddenError();

  const items = await prisma.documentAnalysis.findMany({
    where: { clientId: req.user.clientId },
    orderBy: { createdAt: "desc" },
  });
  res.json(items);
});

/** Recebe um laudo (PDF), pede a analise pra IA e guarda o resultado junto com o arquivo
 * original - historico por cliente, cada laudo novo vira uma linha, nao sobrescreve as
 * anteriores (diferente do ClientInsight, que e' "foto" atual, nao historico). */
export const uploadAndAnalyze = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.clientId) throw new ForbiddenError();
  const file = req.file;
  if (!file) throw new ValidationError("Envie um arquivo PDF.");

  let analise;
  try {
    analise = await analisarLaudo(file.buffer, file.mimetype);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Falha ao analisar o laudo.");
  }

  const key = `document-analyses/${req.user.clientId}/${Date.now()}-${file.originalname}`;
  await getStorageProvider().upload(key, file.buffer, file.mimetype);

  const registro = await prisma.documentAnalysis.create({
    data: {
      clientId: req.user.clientId,
      fileName: file.originalname,
      fileKey: key,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      severity: analise.severity,
      summary: analise.summary,
      createdById: req.user.sub,
    },
  });

  await writeAuditLog({
    userId: req.user.sub,
    action: "CREATE",
    entityType: "DocumentAnalysis",
    entityId: registro.id,
    description: `Laudo "${file.originalname}" analisado pela IA`,
  });

  res.status(201).json(registro);
});

export const getDocumentAnalysisFileUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.clientId) throw new ForbiddenError();

  const registro = await prisma.documentAnalysis.findUnique({ where: { id: req.params.id } });
  if (!registro || registro.clientId !== req.user.clientId) throw new NotFoundError("Analise");

  const url = await getStorageProvider().getSignedDownloadUrl(registro.fileKey, registro.fileName);
  res.json({ url });
});
