import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_PLANNING_ROLES } from "../../middleware/rbac";
import {
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  saveTasks,
  generateWorkOrderFromTask,
  linkWorkOrderToTask,
} from "./controller";

// So equipe interna e planejador do cliente (CMMS_PLANNING_ROLES) - parada programada e'
// decisao de planejamento, nao de quem so executa ou so abre solicitacao.
export const shutdownSchedulesRouter = Router();
shutdownSchedulesRouter.use(requireAuth, requireRole(...CMMS_PLANNING_ROLES));

shutdownSchedulesRouter.get("/", listSchedules);
shutdownSchedulesRouter.get("/:id", getSchedule);
shutdownSchedulesRouter.post("/", createSchedule);
shutdownSchedulesRouter.patch("/:id", updateSchedule);
shutdownSchedulesRouter.delete("/:id", deleteSchedule);

shutdownSchedulesRouter.put("/:id/tarefas", saveTasks);
shutdownSchedulesRouter.post("/:id/tarefas/:taskId/gerar-os", generateWorkOrderFromTask);
shutdownSchedulesRouter.post("/:id/tarefas/:taskId/vincular-os", linkWorkOrderToTask);
