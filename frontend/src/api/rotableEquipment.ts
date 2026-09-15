import { api } from "./client";
import type { CalibrationAttachment, ModoDeImportacao, ResultadoDaImportacao, RotableEquipment, RotableEquipmentStatus, RotableInstallation, RotableRepairOrder, RotableRepairOutcome, RotableRepairPurpose } from "./types";

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
  weightKg?: number | null;
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

export async function getNextRotableCode(params: { type: string; clientId?: string }): Promise<{ code: string | null }> {
  const { data } = await api.get<{ code: string | null }>("/rotable-equipment/proximo-codigo", { params });
  return data;
}

export interface RotableSummary {
  porStatus: Partial<Record<RotableEquipmentStatus, number>>;
  total: number;
}

/** Contagem por status (em estoque, instalado, em reparo...) para os indicadores no topo da
 * lista - sempre do total da empresa, sem levar em conta busca/filtro da tabela. */
export async function getRotableSummary(clientId?: string): Promise<RotableSummary> {
  const { data } = await api.get<RotableSummary>("/rotable-equipment/resumo", { params: { clientId } });
  return data;
}

/** Historico de equipamentos que ja ocuparam esta posicao/ativo - do mais recente pro mais
 * antigo, incluindo o que esta instalado agora (removedAt nulo). */
export async function getRotableInstallationHistory(instrumentId: string): Promise<RotableInstallation[]> {
  const { data } = await api.get<RotableInstallation[]>(`/rotable-equipment/historico-do-ativo/${instrumentId}`);
  return data;
}

// ---------------------------------------------------------------------------
// Importacao / exportacao por planilha - uma aba por tipo de equipamento
// ---------------------------------------------------------------------------

export async function baixarModeloImportacaoRotable(clientId?: string): Promise<Blob> {
  const { data } = await api.get("/rotable-equipment/importar/modelo", { params: { clientId }, responseType: "blob" });
  return data as Blob;
}

export async function simularImportacaoRotable(file: File, clientId?: string, modo: ModoDeImportacao = "ignorar"): Promise<ResultadoDaImportacao> {
  const form = new FormData();
  form.append("file", file);
  if (clientId) form.append("clientId", clientId);
  form.append("modo", modo);
  const { data } = await api.post<ResultadoDaImportacao>("/rotable-equipment/importar/simular", form);
  return data;
}

export async function confirmarImportacaoRotable(file: File, clientId?: string, modo: ModoDeImportacao = "ignorar"): Promise<ResultadoDaImportacao> {
  const form = new FormData();
  form.append("file", file);
  if (clientId) form.append("clientId", clientId);
  form.append("modo", modo);
  const { data } = await api.post<ResultadoDaImportacao>("/rotable-equipment/importar/confirmar", form);
  return data;
}

/** Tudo que esta cadastrado, separado por aba/tipo - mesmo layout do modelo de importacao,
 * com colunas extras de status/instalacao/data de cadastro. */
export async function exportarRotable(clientId?: string): Promise<Blob> {
  const { data } = await api.get("/rotable-equipment/exportar", { params: { clientId }, responseType: "blob" });
  return data as Blob;
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

/** Envia (ou substitui) a foto principal do equipamento recondicionavel. */
export async function uploadRotablePhoto(id: string, file: File): Promise<RotableEquipment> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<RotableEquipment>(`/rotable-equipment/${id}/foto`, form);
  return data;
}

export async function deleteRotablePhoto(id: string): Promise<void> {
  await api.delete(`/rotable-equipment/${id}/foto`);
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
  purpose?: RotableRepairPurpose;
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

/** Ficha de envio (PDF) da ordem de reparo - dados do equipamento (codigo, tipo, peso,
 * valor, ficha tecnica) prontos para a area que emite a nota fiscal de remessa. */
export async function baixarFichaDeEnvio(repairOrderId: string): Promise<Blob> {
  const { data } = await api.get(`/rotable-repair-orders/${repairOrderId}/ficha-envio`, { responseType: "blob" });
  return data as Blob;
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
  returnInvoiceNumber?: string | null;
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

/** Anexa o orcamento (PDF/foto) que o fornecedor mandou, junto do numero da requisicao de
 * compras ou pedido que a empresa abriu para autorizar o reparo. */
export async function uploadRepairOrderBudget(
  repairOrderId: string,
  file: File,
  purchaseRequisitionNumber?: string | null,
): Promise<{ attachment: CalibrationAttachment; order: RotableRepairOrder }> {
  const form = new FormData();
  form.append("file", file);
  if (purchaseRequisitionNumber) form.append("purchaseRequisitionNumber", purchaseRequisitionNumber);
  const { data } = await api.post(`/rotable-repair-orders/${repairOrderId}/anexos`, form);
  return data;
}

export async function listRepairOrderAttachments(repairOrderId: string): Promise<CalibrationAttachment[]> {
  const { data } = await api.get<CalibrationAttachment[]>(`/rotable-repair-orders/${repairOrderId}/anexos`);
  return data;
}

export async function getRepairOrderAttachmentUrl(repairOrderId: string, attachmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(`/rotable-repair-orders/${repairOrderId}/anexos/${attachmentId}/url`);
  return data.url;
}

export async function deleteRepairOrderAttachment(repairOrderId: string, attachmentId: string): Promise<void> {
  await api.delete(`/rotable-repair-orders/${repairOrderId}/anexos/${attachmentId}`);
}
