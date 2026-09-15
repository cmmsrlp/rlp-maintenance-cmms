import { api } from "./client";
import type { PagedResult } from "./client";
import type { AttachmentCategory, CalibrationAttachment, MaintenancePriority, ServiceRequest, ServiceRequestStatus, ConversaoDaSolicitacao } from "./types";

export interface ListServiceRequestsParams {
  page?: number;
  pageSize?: number;
  clientId?: string;
  status?: ServiceRequestStatus;
  instrumentId?: string;
  areaId?: string;
  search?: string;
}

export async function listServiceRequests(params: ListServiceRequestsParams = {}): Promise<PagedResult<ServiceRequest>> {
  const { data } = await api.get<PagedResult<ServiceRequest>>("/service-requests", { params });
  return data;
}

export async function getServiceRequest(id: string): Promise<ServiceRequest> {
  const { data } = await api.get<ServiceRequest>(`/service-requests/${id}`);
  return data;
}

export interface ServiceRequestInput {
  clientId?: string;
  areaId?: string | null;
  instrumentId?: string | null;
  location?: string | null;
  categoryId?: string | null;
  description: string;
  safetyImpact?: boolean;
  qualityImpact?: boolean;
  productionImpact?: boolean;
  suggestedPriority?: MaintenancePriority;
}

export async function createServiceRequest(input: ServiceRequestInput): Promise<ServiceRequest> {
  const { data } = await api.post<ServiceRequest>("/service-requests", input);
  return data;
}

export async function updateServiceRequest(id: string, input: Partial<ServiceRequestInput>): Promise<ServiceRequest> {
  const { data } = await api.patch<ServiceRequest>(`/service-requests/${id}`, input);
  return data;
}

export async function deleteServiceRequest(id: string): Promise<void> {
  await api.delete(`/service-requests/${id}`);
}

/** Cancela sem apagar o registro - a solicitacao continua visivel, so muda de status e cai
 * na coluna de encerradas do quadro. */
export async function cancelServiceRequest(id: string): Promise<ServiceRequest> {
  const { data } = await api.post<ServiceRequest>(`/service-requests/${id}/cancel`);
  return data;
}

export async function triageServiceRequest(
  id: string,
  input: { decision: "approve" | "request_info" | "reject"; notes?: string; rejectionReason?: string },
): Promise<ServiceRequest> {
  const { data } = await api.post<ServiceRequest>(`/service-requests/${id}/triage`, input);
  return data;
}

export async function convertServiceRequest(id: string, dados?: ConversaoDaSolicitacao): Promise<ServiceRequest> {
  const { data } = await api.post<ServiceRequest>(`/service-requests/${id}/convert`, dados ?? {});
  return data;
}

export async function listServiceRequestAttachments(requestId: string): Promise<CalibrationAttachment[]> {
  const { data } = await api.get<CalibrationAttachment[]>(`/service-requests/${requestId}/attachments`);
  return data;
}

export async function uploadServiceRequestAttachment(
  requestId: string,
  file: File,
  category: AttachmentCategory,
  caption?: string,
): Promise<CalibrationAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (caption) formData.append("caption", caption);
  const { data } = await api.post<CalibrationAttachment>(`/service-requests/${requestId}/attachments`, formData);
  return data;
}

export async function deleteServiceRequestAttachment(requestId: string, attachmentId: string): Promise<void> {
  await api.delete(`/service-requests/${requestId}/attachments/${attachmentId}`);
}

export async function getServiceRequestAttachmentUrl(requestId: string, attachmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(`/service-requests/${requestId}/attachments/${attachmentId}/url`);
  return data.url;
}
