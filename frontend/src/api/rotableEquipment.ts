import { api } from "./client";
import type { RotableEquipment, RotableEquipmentStatus, RotableInstallation, RotableRepairOrder, RotableRepairOutcome } from "./types";

export interface RotableEquipmentInput {
  clientId?: string;
  code: string;
  type: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  specificAttributes?: Record<string, string> | null;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
  notes?: string | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listRotableEquipment(params: {
  clientId?: string;
  status?: RotableEquipmentStatus;
  type?: string;
  search?: string;
  instrumentId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
} = {}): Promise<PagedResult<RotableEquipment>> {
  const { data } = await api.get<PagedResult<RotableEquipment>>("/rotable-equipment", { params });
  return data;
}

export async function getRotableEquipment(id: string): Promise<RotableEquipment> {
  const { data } = await api.get<RotableEquipment>(`/rotable-equipment/${id}`);
  return data;
}

export async function createRotableEquipment(input: RotableEquipmentInput): Promise<RotableEquipment> {
  const { data } = await api.post<RotableEquipment>("/rotable-equipment", input);
  return data;
}

export async function updateRotableEquipment(id: string, input: Partial<RotableEquipmentInput>): Promise<RotableEquipment> {
  const { data } = await api.patch<RotableEquipment>(`/rotable-equipment/${id}`, input);
  return data;
}

export async function deleteRotableEquipment(id: string): Promise<void> {
  await api.delete(`/rotable-equipment/${id}`);
}

export async function installRotableEquipment(
  id: string,
  input: { instrumentId: string; meterReading?: number | null; notes?: string | null },
): Promise<RotableInstallation> {
  const { data } = await api.post<RotableInstallation>(`/rotable-equipment/${id}/instalar`, input);
  return data;
}

export async function removeRotableEquipment(
  id: string,
  input: { removalReason?: string | null; conditionAtRemoval?: string | null; meterReading?: number | null; destinationStatus?: "IN_STOCK" | "QUARANTINE"; notes?: string | null },
): Promise<void> {
  await api.post(`/rotable-equipment/${id}/remover`, input);
}

export interface SubstituteRotableInput {
  workOrderId: string;
  outgoingRotableId: string;
  incomingRotableId: string;
  removalReason?: string | null;
  conditionAtRemoval?: string | null;
  meterReadingAtRemoval?: number | null;
  meterReadingAtInstall?: number | null;
  openRepairOrder?: boolean;
  repairOrder?: { defectReported?: string | null; failureCodeId?: string | null; vendor?: string | null } | null;
}

export async function substituteRotableEquipment(input: SubstituteRotableInput): Promise<{ installation: RotableInstallation; repairOrder: RotableRepairOrder | null }> {
  const { data } = await api.post("/rotable-equipment/substituir", input);
  return data;
}

export async function listRepairOrders(rotableId: string): Promise<RotableRepairOrder[]> {
  const { data } = await api.get<RotableRepairOrder[]>(`/rotable-equipment/${rotableId}/reparos`);
  return data;
}

export interface RepairOrderInput {
  defectReported?: string | null;
  diagnosis?: string | null;
  failureCodeId?: string | null;
  vendor?: string | null;
  budgetNumber?: string | null;
  budgetValue?: number | null;
  promisedReturnAt?: string | null;
  notes?: string | null;
}

export async function createRepairOrder(rotableId: string, input: RepairOrderInput): Promise<RotableRepairOrder> {
  const { data } = await api.post<RotableRepairOrder>(`/rotable-equipment/${rotableId}/reparos`, input);
  return data;
}

export async function updateRepairOrder(id: string, input: Partial<RepairOrderInput>): Promise<RotableRepairOrder> {
  const { data } = await api.patch<RotableRepairOrder>(`/rotable-repair-orders/${id}`, input);
  return data;
}

export async function approveRepairBudget(id: string): Promise<RotableRepairOrder> {
  const { data } = await api.post<RotableRepairOrder>(`/rotable-repair-orders/${id}/aprovar-orcamento`);
  return data;
}

export async function rejectRepairBudget(id: string): Promise<RotableRepairOrder> {
  const { data } = await api.post<RotableRepairOrder>(`/rotable-repair-orders/${id}/reprovar-orcamento`);
  return data;
}

export interface ReturnFromRepairInput {
  outcome: RotableRepairOutcome;
  serviceDone?: string | null;
  partsReplacedNotes?: string | null;
  laborNotes?: string | null;
  testsPerformed?: string | null;
  finalReport?: string | null;
  warrantyMonths?: number | null;
  warrantyNotes?: string | null;
  finalCost?: number | null;
  conditionAfterRepair?: string | null;
}

export async function returnFromRepair(id: string, input: ReturnFromRepairInput): Promise<RotableRepairOrder> {
  const { data } = await api.post<RotableRepairOrder>(`/rotable-repair-orders/${id}/retorno`, input);
  return data;
}
