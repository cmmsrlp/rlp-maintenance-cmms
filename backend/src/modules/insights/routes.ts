import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_PLANNING_ROLES } from "../../middleware/rbac";
import { listInsights, generateInsights, getOwnInsight, generateOwnInsight } from "./controller";

export const insightsRouter = Router();

insightsRouter.use(requireAuth);

// Visao interna (equipe RLP): todos os clientes de uma vez.
insightsRouter.get("/", requireRole("ADMIN"), listInsights);
insightsRouter.post("/generate", requireRole("ADMIN"), generateInsights);

// Autoatendimento do portal: o cliente ve e gera so' o proprio insight.
insightsRouter.get("/mine", requireRole(...CMMS_PLANNING_ROLES), getOwnInsight);
insightsRouter.post("/mine/generate", requireRole(...CMMS_PLANNING_ROLES), generateOwnInsight);
