import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_PLANNING_ROLES } from "../../middleware/rbac";
import { uploadPdf } from "../../middleware/upload";
import { listMyDocumentAnalyses, uploadAndAnalyze, getDocumentAnalysisFileUrl } from "./controller";

export const documentAnalysisRouter = Router();

documentAnalysisRouter.use(requireAuth, requireRole(...CMMS_PLANNING_ROLES));

documentAnalysisRouter.get("/", listMyDocumentAnalyses);
documentAnalysisRouter.post("/", uploadPdf.single("file"), uploadAndAnalyze);
documentAnalysisRouter.get("/:id/url", getDocumentAnalysisFileUrl);
