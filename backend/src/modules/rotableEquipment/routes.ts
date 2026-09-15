import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_ROLES, CMMS_ADMIN_ROLES } from "../../middleware/rbac";
import { uploadAny } from "../../middleware/upload";
import {
  listRotableEquipment,
  getRotableEquipment,
  createRotableEquipment,
  updateRotableEquipment,
  deleteRotableEquipment,
  installRotableEquipment,
  removeRotableEquipment,
  substituteRotableEquipment,
  listRepairOrders,
  createRepairOrder,
  updateRepairOrder,
  approveRepairBudget,
  rejectRepairBudget,
  returnFromRepair,
  getNextRotableCode,
  getRotableInstallationHistory,
  getRotableSummary,
  getRepairOrderShipmentPdf,
  uploadRepairOrderBudget,
  listRepairOrderAttachments,
  getRepairOrderAttachmentUrl,
  deleteRepairOrderAttachment,
} from "./controller";
import { baixarModeloRotable, simularImportacaoRotable, confirmarImportacaoRotable, exportarRotable } from "./importExport";

/** Planilha e' arquivo de escritorio, nao imagem nem PDF - mesmo filtro do modulo de
 * importacao geral (imports/routes.ts). */
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

export const rotableEquipmentRouter = Router();

rotableEquipmentRouter.use(requireAuth, requireRole(...CMMS_ROLES));

// Antes de "/:id" para essas rotas nao serem lidas como um id de equipamento.
rotableEquipmentRouter.post("/substituir", substituteRotableEquipment);
rotableEquipmentRouter.get("/proximo-codigo", getNextRotableCode);
rotableEquipmentRouter.get("/historico-do-ativo/:instrumentId", getRotableInstallationHistory);
rotableEquipmentRouter.get("/resumo", getRotableSummary);
rotableEquipmentRouter.get("/importar/modelo", baixarModeloRotable);
rotableEquipmentRouter.post("/importar/simular", requireRole(...CMMS_ADMIN_ROLES), uploadPlanilha.single("file"), simularImportacaoRotable);
rotableEquipmentRouter.post("/importar/confirmar", requireRole(...CMMS_ADMIN_ROLES), uploadPlanilha.single("file"), confirmarImportacaoRotable);
rotableEquipmentRouter.get("/exportar", exportarRotable);

rotableEquipmentRouter.get("/", listRotableEquipment);
rotableEquipmentRouter.get("/:id", getRotableEquipment);
rotableEquipmentRouter.post("/", createRotableEquipment);
rotableEquipmentRouter.patch("/:id", updateRotableEquipment);
rotableEquipmentRouter.delete("/:id", requireRole(...CMMS_ADMIN_ROLES), deleteRotableEquipment);

rotableEquipmentRouter.post("/:id/instalar", installRotableEquipment);
rotableEquipmentRouter.post("/:id/remover", removeRotableEquipment);

rotableEquipmentRouter.get("/:id/reparos", listRepairOrders);
rotableEquipmentRouter.post("/:id/reparos", createRepairOrder);

export const rotableRepairOrdersRouter = Router();
rotableRepairOrdersRouter.use(requireAuth, requireRole(...CMMS_ROLES));
rotableRepairOrdersRouter.patch("/:id", updateRepairOrder);
rotableRepairOrdersRouter.post("/:id/aprovar-orcamento", approveRepairBudget);
rotableRepairOrdersRouter.post("/:id/reprovar-orcamento", rejectRepairBudget);
rotableRepairOrdersRouter.post("/:id/retorno", returnFromRepair);
rotableRepairOrdersRouter.get("/:id/ficha-envio", getRepairOrderShipmentPdf);
rotableRepairOrdersRouter.get("/:id/anexos", listRepairOrderAttachments);
rotableRepairOrdersRouter.post("/:id/anexos", uploadAny.single("file"), uploadRepairOrderBudget);
rotableRepairOrdersRouter.get("/:id/anexos/:attachmentId/url", getRepairOrderAttachmentUrl);
rotableRepairOrdersRouter.delete("/:id/anexos/:attachmentId", deleteRepairOrderAttachment);
