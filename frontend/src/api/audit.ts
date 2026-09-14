import { api } from "./client";
import type { PagedResult } from "./client";
import type { AuditLogEntry } from "./types";

export interface ListAuditLogsParams {
  page?: number;
  pageSize?: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
}

export async function listAuditLogs(params: ListAuditLogsParams = {}): Promise<PagedResult<AuditLogEntry>> {
  const { data } = await api.get<PagedResult<AuditLogEntry>>("/audit-logs", { params });
  return data;
}

/** Auditoria da propria empresa, vista do portal do cliente - so' o que os usuarios dela
 * fizeram (ver comentario de listOwnAuditLogs no backend sobre o que fica de fora). */
export async function listOwnAuditLogs(
  params: Omit<ListAuditLogsParams, "userId"> = {},
): Promise<PagedResult<AuditLogEntry>> {
  const { data } = await api.get<PagedResult<AuditLogEntry>>("/audit-logs/minha-empresa", { params });
  return data;
}
