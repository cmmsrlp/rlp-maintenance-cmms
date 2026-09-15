import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_ROLES, CMMS_ADMIN_ROLES } from "../../middleware/rbac";
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
} from "./controller";

export const rotableEquipmentRouter = Router();

rotableEquipmentRouter.use(requireAuth, requireRole(...CMMS_ROLES));

// Antes de "/:id" para essas rotas nao serem lidas como um id de equipamento.
rotableEquipmentRouter.post("/substituir", substituteRotableEquipment);
rotableEquipmentRouter.get("/proximo-codigo", getNextRotableCode);
rotableEquipmentRouter.get("/historico-do-ativo/:instrumentId", getRotableInstallationHistory);

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
