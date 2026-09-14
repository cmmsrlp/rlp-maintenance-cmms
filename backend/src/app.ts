import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import path from "node:path";
import { env } from "./config/env";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

import { authRouter } from "./modules/auth/routes";
import { usersRouter } from "./modules/users/routes";
import { clientsRouter } from "./modules/clients/routes";
import { instrumentsRouter } from "./modules/instruments/routes";
import { attachmentsRouter } from "./modules/attachments/routes";
import { auditRouter } from "./modules/audit/routes";
import { notificationsRouter } from "./modules/notifications/routes";
import { dashboardRouter } from "./modules/dashboard/routes";
import { searchRouter } from "./modules/search/routes";
import { localStorageRouter } from "./modules/localStorage/routes";
import { metersRouter } from "./modules/meters/routes";
import { rotableEquipmentRouter, rotableRepairOrdersRouter } from "./modules/rotableEquipment/routes";
import { failureCodesRouter } from "./modules/failureCodes/routes";
import { assetTypesRouter } from "./modules/assetTypes/routes";
import { laborTypesRouter } from "./modules/laborTypes/routes";
import { laborResourcesRouter } from "./modules/laborResources/routes";
import { maintenancePlansRouter } from "./modules/maintenancePlans/routes";
import { maintenancePlanTemplatesRouter } from "./modules/maintenancePlanTemplates/routes";
import { maintenanceWorkOrdersRouter } from "./modules/maintenanceWorkOrders/routes";
import { sparePartsRouter } from "./modules/spareParts/routes";
import { lubricationRouter } from "./modules/lubrication/routes";
import { importsRouter } from "./modules/imports/routes";
import { plantsRouter } from "./modules/plants/routes";
import { areasRouter } from "./modules/areas/routes";
import { assetSystemsRouter } from "./modules/assetSystems/routes";
import { costCentersRouter } from "./modules/costCenters/routes";
import { serviceRequestsRouter } from "./modules/serviceRequests/routes";
import { serviceRequestCategoriesRouter } from "./modules/serviceRequestCategories/routes";
import { stoppageReasonsRouter } from "./modules/stoppageReasons/routes";
import { rootCauseAnalysesRouter } from "./modules/rootCauseAnalyses/routes";
import { plansRouter } from "./modules/plans/routes";
import { insightsRouter } from "./modules/insights/routes";
import { documentAnalysisRouter } from "./modules/documentAnalysis/routes";
import { assistantRouter } from "./modules/assistant/routes";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  // Fotos e anexos ficam num armazenamento de objetos (R2/S3), noutro dominio, e a previa
  // de um arquivo recem escolhido e' uma URL blob:. O CSP padrao do helmet e' img-src
  // 'self' data:, que bloqueava as duas coisas em silencio - nenhuma foto guardada
  // aparecia na tela. Libero exatamente o endpoint configurado, e nada alem dele.
  const origemDoArmazenamento = (() => {
    try {
      return env.storage.s3Endpoint ? new URL(env.storage.s3Endpoint).origin : null;
    } catch {
      return null;
    }
  })();

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "blob:", ...(origemDoArmazenamento ? [origemDoArmazenamento, `*.${new URL(origemDoArmazenamento).hostname}`] : [])],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: env.isProduction ? env.publicUrl : env.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  if (!env.isProduction) app.use(morgan("dev"));

  // Rota de saude: nunca consulta o banco. Aponte monitores de uptime (UptimeRobot
  // etc.) para ca, nunca para "/", para nao manter o Neon acordado o tempo todo.
  app.get("/api/ping", (_req, res) => res.status(200).json({ status: "ok" }));

  app.use("/api/local-storage", localStorageRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/instruments", instrumentsRouter);
  app.use("/api/attachments", attachmentsRouter);
  app.use("/api/audit-logs", auditRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/meters", metersRouter);
  app.use("/api/rotable-equipment", rotableEquipmentRouter);
  app.use("/api/rotable-repair-orders", rotableRepairOrdersRouter);
  app.use("/api/failure-codes", failureCodesRouter);
  app.use("/api/asset-types", assetTypesRouter);
  app.use("/api/labor-types", laborTypesRouter);
  app.use("/api/labor-resources", laborResourcesRouter);
  app.use("/api/maintenance-plans", maintenancePlansRouter);
  app.use("/api/maintenance-plan-templates", maintenancePlanTemplatesRouter);
  app.use("/api/maintenance-work-orders", maintenanceWorkOrdersRouter);
  app.use("/api/spare-parts", sparePartsRouter);
  app.use("/api/lubrificacao", lubricationRouter);
  app.use("/api/importacao", importsRouter);
  app.use("/api/plants", plantsRouter);
  app.use("/api/areas", areasRouter);
  app.use("/api/asset-systems", assetSystemsRouter);
  app.use("/api/cost-centers", costCentersRouter);
  app.use("/api/service-requests", serviceRequestsRouter);
  app.use("/api/service-request-categories", serviceRequestCategoriesRouter);
  app.use("/api/stoppage-reasons", stoppageReasonsRouter);
  app.use("/api/root-cause-analyses", rootCauseAnalysesRouter);
  app.use("/api/plans", plansRouter);
  app.use("/api/insights", insightsRouter);
  app.use("/api/document-analyses", documentAnalysisRouter);
  app.use("/api/assistant", assistantRouter);

  if (env.isProduction) {
    const frontendDist = path.resolve(__dirname, "../../frontend/dist");
    app.use(express.static(frontendDist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  app.use("/api", notFoundHandler);
  app.use(errorHandler);

  return app;
}
