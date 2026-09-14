import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { listAuditLogs, listOwnAuditLogs } from "./controller";

export const auditRouter = Router();
auditRouter.use(requireAuth);

auditRouter.get("/", requireRole("ADMIN"), listAuditLogs);
// Rota literal antes de nenhuma parametrizada existir aqui - nao ha risco de colisao hoje,
// mas segue o mesmo cuidado usado no resto do backend.
auditRouter.get("/minha-empresa", requireRole("CLIENT", "CLIENT_PLANNER"), listOwnAuditLogs);
