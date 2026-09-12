import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";
import { listInsights, generateInsights } from "./controller";

export const insightsRouter = Router();

insightsRouter.use(requireAuth, requireRole("ADMIN"));

insightsRouter.get("/", listInsights);
insightsRouter.post("/generate", generateInsights);
