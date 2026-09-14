import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_ROLES } from "../../middleware/rbac";
import { listCriticalities, getCriticalitySummary, getCriticality, reviewCriticality, recalculateCriticality } from "./controller";

export const assetCriticalityRouter = Router();
assetCriticalityRouter.use(requireAuth, requireRole(...CMMS_ROLES));

// Antes de "/:instrumentId" pra "resumo" nao ser lido como um id de ativo.
assetCriticalityRouter.get("/resumo", getCriticalitySummary);

assetCriticalityRouter.get("/", listCriticalities);
assetCriticalityRouter.get("/:instrumentId", getCriticality);
assetCriticalityRouter.patch("/:instrumentId", reviewCriticality);
assetCriticalityRouter.post("/:instrumentId/recalcular", recalculateCriticality);
