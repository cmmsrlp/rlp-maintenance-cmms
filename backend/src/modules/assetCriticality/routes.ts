import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_ROLES } from "../../middleware/rbac";
import {
  listCriticalities,
  getCriticalitySummary,
  getCriticality,
  reviewCriticality,
  recalculateCriticality,
  exportCriticalities,
  simulateImportCriticalities,
  confirmImportCriticalities,
} from "./controller";

const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    if (permitidos.includes(file.mimetype) || file.originalname.toLowerCase().endsWith(".xlsx")) cb(null, true);
    else cb(new Error("Envie a planilha em .xlsx."));
  },
});

export const assetCriticalityRouter = Router();
assetCriticalityRouter.use(requireAuth, requireRole(...CMMS_ROLES));

// Rotas literais antes de "/:instrumentId" pra nao ser lido como um id de ativo.
assetCriticalityRouter.get("/resumo", getCriticalitySummary);
assetCriticalityRouter.get("/exportar", exportCriticalities);
assetCriticalityRouter.post("/importar/simular", uploadPlanilha.single("file"), simulateImportCriticalities);
assetCriticalityRouter.post("/importar/confirmar", uploadPlanilha.single("file"), confirmImportCriticalities);

assetCriticalityRouter.get("/", listCriticalities);
assetCriticalityRouter.get("/:instrumentId", getCriticality);
assetCriticalityRouter.patch("/:instrumentId", reviewCriticality);
assetCriticalityRouter.post("/:instrumentId/recalcular", recalculateCriticality);
