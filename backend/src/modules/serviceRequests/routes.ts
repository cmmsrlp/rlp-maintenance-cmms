import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { requireRole, CMMS_ROLES, SERVICE_REQUEST_ROLES } from "../../middleware/rbac";
import { uploadAny } from "../../middleware/upload";
import {
  listServiceRequests,
  getServiceRequest,
  createServiceRequest,
  updateServiceRequest,
  deleteServiceRequest,
  cancelServiceRequest,
  triageServiceRequest,
  convertServiceRequest,
  listServiceRequestAttachmentsRoute,
  uploadServiceRequestAttachment,
  deleteServiceRequestAttachment,
  getServiceRequestAttachmentUrl,
} from "./controller";

export const serviceRequestsRouter = Router();

// O CMMS e' do cliente: quem abre, tria e converte a solicitacao e' a equipe dele.
// Abrir e acompanhar solicitacao inclui o Solicitante; decidir o que fazer com ela
// (triagem, conversao em OS, edicao, exclusao) continua sendo da equipe do cliente.
serviceRequestsRouter.use(requireAuth, requireRole(...SERVICE_REQUEST_ROLES));

serviceRequestsRouter.get("/", listServiceRequests);
serviceRequestsRouter.get("/:id", getServiceRequest);
serviceRequestsRouter.post("/", requireRole(...SERVICE_REQUEST_ROLES), createServiceRequest);
// O controller ja restringe edicao pos-triagem a equipe interna (STAFF_ROLES) - o
// Solicitante precisa alcancar a rota para corrigir a propria solicitacao enquanto ela
// ainda esta Aberta ou Aguardando informacao.
serviceRequestsRouter.patch("/:id", requireRole(...SERVICE_REQUEST_ROLES), updateServiceRequest);
serviceRequestsRouter.delete("/:id", requireRole(...CMMS_ROLES), deleteServiceRequest);
// Cancelar substitui o "remover" no fluxo normal: mantem o historico, so muda o status.
// Disponivel para quem pode abrir solicitacao (inclui o Solicitante, so na propria).
serviceRequestsRouter.post("/:id/cancel", requireRole(...SERVICE_REQUEST_ROLES), cancelServiceRequest);

// Triagem e conversao em OS sao do proprio cliente, igual ao resto do modulo (plano, OS,
// checklist, almoxarifado). O ADMIN da OptiProcess alcanca por acesso master de suporte.
serviceRequestsRouter.post("/:id/triage", requireRole(...CMMS_ROLES), triageServiceRequest);
serviceRequestsRouter.post("/:id/convert", requireRole(...CMMS_ROLES), convertServiceRequest);

serviceRequestsRouter.get("/:id/attachments", listServiceRequestAttachmentsRoute);
serviceRequestsRouter.get("/:id/attachments/:attachmentId/url", getServiceRequestAttachmentUrl);
serviceRequestsRouter.post(
  "/:id/attachments",
  requireRole(...CMMS_ROLES),
  uploadAny.single("file"),
  uploadServiceRequestAttachment,
);
serviceRequestsRouter.delete(
  "/:id/attachments/:attachmentId",
  requireRole(...CMMS_ROLES),
  deleteServiceRequestAttachment,
);
