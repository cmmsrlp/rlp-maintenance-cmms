import { api } from "./client";
import type { PagedResult } from "./client";
import type { MaintenanceOrderStatus, MaintenancePlan, MaintenanceTriggerType, MaintenancePlanStatus, MaintenancePlanType, MaintenancePlanScope, MaintenancePriority, AttachmentCategory, CalibrationAttachment } from "./types";

export interface ListMaintenancePlansParams {
  page?: number;
  pageSize?: number;
  clientId?: string;
  instrumentId?: string;
  active?: boolean;
}

export async function listMaintenancePlans(params: ListMaintenancePlansParams = {}): Promise<PagedResult<MaintenancePlan>> {
  const { data } = await api.get<PagedResult<MaintenancePlan>>("/maintenance-plans", { params });
  return data;
}

export async function getMaintenancePlan(id: string): Promise<MaintenancePlan> {
  const { data } = await api.get<MaintenancePlan>(`/maintenance-plans/${id}`);
  return data;
}

export interface MaintenancePlanInput {
  clientId: string;
  // Opcional: um plano pode nascer sem ativo e ganhar um depois, na edicao.
  instrumentId?: string | null;
  name: string;
  description?: string | null;
  triggerType: MaintenanceTriggerType;
  frequencyDays?: number | null;
  meterId?: string | null;
  meterInterval?: number | null;
  active?: boolean;
  status?: MaintenancePlanStatus;
  planType?: MaintenancePlanType;
  scope?: MaintenancePlanScope;
  defaultPriority?: MaintenancePriority;
  specialtyId?: string | null;
  frequencyUnit?: string;
  frequencyEvery?: number | null;
  baseDate?: string | null;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  monthOfYear?: number | null;
  operationalCalendar?: string;
  blockedDates?: string[];
  generateAdvanceDays?: number | null;
  meterBaseReading?: number | null;
  generateAdvanceMeterUnits?: number | null;
  toleranceMeterBefore?: number | null;
  toleranceMeterAfter?: number | null;
  meterResetRule?: string;
  triggerMode?: string;
  conditionMeterId?: string | null;
  initialWorkOrderStatus?: string;
  requiresShutdown?: boolean;
  estimatedShutdownHours?: number | null;
  requiresOperationalRelease?: boolean;
  requiresLoto?: boolean;
  requiresApproval?: boolean;
  groupWorkOrder?: boolean;
  materialPolicy?: string;
  responsibleId?: string | null;
  checklistTemplate?: { description: string }[];
  toleranceDaysBefore?: number | null;
  toleranceDaysAfter?: number | null;
  procedure?: string | null;
  estimatedLaborHours?: number | null;
  templateId?: string | null;
  parts?: { sparePartId: string; quantity: number; required?: boolean; alternativeSparePartId?: string | null; suggestedSupplier?: string | null; notes?: string | null }[];
}

export async function createMaintenancePlan(input: MaintenancePlanInput): Promise<MaintenancePlan> {
  const { data } = await api.post<MaintenancePlan>("/maintenance-plans", input);
  return data;
}

export async function updateMaintenancePlan(id: string, input: Partial<MaintenancePlanInput>): Promise<MaintenancePlan> {
  const { data } = await api.patch<MaintenancePlan>(`/maintenance-plans/${id}`, input);
  return data;
}

export async function deleteMaintenancePlan(id: string): Promise<void> {
  await api.delete(`/maintenance-plans/${id}`);
}

/** Gera a OS do plano. `forcar` antecipa a geracao antes da antecedencia configurada -
 * usado quando o planejador decide puxar a preventiva de proposito. */
export async function generateWorkOrderFromPlan(id: string, forcar = false): Promise<{ id: string; number: string }> {
  const { data } = await api.post<{ id: string; number: string }>(`/maintenance-plans/${id}/generate`, { forcar });
  return data;
}


export interface PlanIndicators {
  lastExecutionAt: string | null;
  nextDueDate: string | null;
  nextGenerationDate: string | null;
  nextDueBreakdown: string | null;
  totals: { generated: number; completed: number; open: number; overdue: number };
  /** null = sem OS concluida ainda; a tela mostra "Dados insuficientes", nao 0%. */
  compliancePct: number | null;
  laborHours: { planned: number | null; actual: number | null };
  cost: {
    parts: number;
    labor: number;
    thirdParty: number;
    total: number;
    tracked: boolean;
    /** Custo previsto de um ciclo e do periodo. Cobre so material: o plano guarda HH
     * prevista, mas nao valor/hora - ver plannedCovers. */
    plannedPerCycle: number | null;
    planned: number | null;
    plannedCovers?: "material";
  };
  materialUsage: { name: string; unit: string; quantity: number }[];
  failuresFound: number;
  workOrders: {
    id: string;
    number: string;
    status: MaintenanceOrderStatus;
    scheduledDate: string | null;
    completedAt: string | null;
    createdAt: string;
  }[];
}

export async function getMaintenancePlanIndicators(id: string): Promise<PlanIndicators> {
  const { data } = await api.get<PlanIndicators>(`/maintenance-plans/${id}/indicators`);
  return data;
}

export async function duplicateMaintenancePlan(id: string): Promise<MaintenancePlan> {
  const { data } = await api.post<MaintenancePlan>(`/maintenance-plans/${id}/duplicate`);
  return data;
}

/** Atribui o plano (criado sem ativo) a um ou mais ativos - o primeiro vira o ativo deste
 * plano, cada ativo a mais gera uma copia completa (mesma configuracao) so que para ele. */
export async function atribuirAtivosAoPlano(id: string, instrumentIds: string[]): Promise<{ planos: MaintenancePlan[] }> {
  const { data } = await api.post<{ planos: MaintenancePlan[] }>(`/maintenance-plans/${id}/ativos`, { instrumentIds });
  return data;
}

/** Roda a geracao automatica agora, em vez de esperar a proxima passada automatica. */
export async function runPlanGeneration(): Promise<{
  avaliados: number;
  gerados: { planId: string; code: string | null; workOrderNumber: string }[];
  ignorados: { planId: string; code: string | null; motivo: string }[];
}> {
  const { data } = await api.post("/maintenance-plans/gerar-vencidos");
  return data;
}

// --------------------------------------------------------------------------
// Anexo do plano: procedimento, ficha tecnica, foto de referencia - opcional.
// --------------------------------------------------------------------------

export async function listMaintenancePlanAttachments(planId: string): Promise<CalibrationAttachment[]> {
  const { data } = await api.get<CalibrationAttachment[]>(`/maintenance-plans/${planId}/attachments`);
  return data;
}

export async function uploadMaintenancePlanAttachment(
  planId: string,
  file: File,
  category: AttachmentCategory,
  caption?: string,
): Promise<CalibrationAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (caption) formData.append("caption", caption);
  const { data } = await api.post<CalibrationAttachment>(`/maintenance-plans/${planId}/attachments`, formData);
  return data;
}

export async function deleteMaintenancePlanAttachment(planId: string, attachmentId: string): Promise<void> {
  await api.delete(`/maintenance-plans/${planId}/attachments/${attachmentId}`);
}

export async function getMaintenancePlanAttachmentUrl(planId: string, attachmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(`/maintenance-plans/${planId}/attachments/${attachmentId}/url`);
  return data.url;
}

// --------------------------------------------------------------------------
// Interruptor geral da geracao automatica de OS (so ADMIN) - a rodada periodica que ja
// existia, agora com controle e prova de que rodou.
// --------------------------------------------------------------------------

export interface AutomationStatus {
  planGenerationEnabled: boolean;
  lastRunAt: string | null;
  lastRunGeneratedCount: number | null;
  lastRunIgnoredCount: number | null;
  lastRunErrorCount: number | null;
}

export async function getAutomationStatus(): Promise<AutomationStatus> {
  const { data } = await api.get<AutomationStatus>("/maintenance-plans/automacao");
  return data;
}

export async function updateAutomationStatus(enabled: boolean): Promise<AutomationStatus> {
  const { data } = await api.patch<AutomationStatus>("/maintenance-plans/automacao", { enabled });
  return data;
}
