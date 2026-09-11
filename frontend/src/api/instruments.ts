import { api } from "./client";
import type { PagedResult } from "./client";
import type { AssetPart, AssetPartHistoryEntry, AttachmentCategory, CalibrationAttachment, Instrument, InstrumentCostSummary, InstrumentStatus, MaintenancePriority, OperationalStatus } from "./types";

export interface ListInstrumentsParams {
  /** "cmms" pede a arvore completa do cliente; sem isso a equipe interna ve so calibraveis. */
  scope?: string;
  /** Pede a consulta inteira, sem o teto de paginacao - usado ao buscar um nivel da
   * arvore (raizes ou os filhos de um no), que pode ter mais itens do que o teto normal
   * mesmo sendo so um nivel. */
  all?: boolean;
  /** So os ativos sem pai deste cliente - primeiro nivel da arvore sob demanda. */
  rootOnly?: boolean;
  page?: number;
  pageSize?: number;
  clientId?: string;
  status?: InstrumentStatus;
  parentId?: string;
  criticality?: MaintenancePriority;
  operationalStatus?: OperationalStatus;
  plantId?: string;
  areaId?: string;
  systemId?: string;
  costCenterId?: string;
  search?: string;
}

export async function listInstruments(params: ListInstrumentsParams = {}): Promise<PagedResult<Instrument>> {
  const { data } = await api.get<PagedResult<Instrument>>("/instruments", { params });
  return data;
}

export async function getInstrument(id: string): Promise<Instrument> {
  const { data } = await api.get<Instrument>(`/instruments/${id}`);
  return data;
}

export type InstrumentInput = Partial<
  Omit<Instrument, "id" | "status" | "derivedStatus" | "nextDueDate" | "calibrations" | "client" | "parent" | "children">
>;

export async function createInstrument(input: InstrumentInput): Promise<Instrument> {
  const { data } = await api.post<Instrument>("/instruments", input);
  return data;
}

export async function updateInstrument(id: string, input: InstrumentInput): Promise<Instrument> {
  const { data } = await api.patch<Instrument>(`/instruments/${id}`, input);
  return data;
}

export async function deleteInstrument(id: string): Promise<void> {
  await api.delete(`/instruments/${id}`);
}

// --------------------------------------------------------------------------
// BOM (lista de materiais): pecas do almoxarifado usadas no ativo
// --------------------------------------------------------------------------

export async function listAssetParts(instrumentId: string): Promise<AssetPart[]> {
  const { data } = await api.get<AssetPart[]>(`/instruments/${instrumentId}/parts`);
  return data;
}

export async function addAssetPart(instrumentId: string, sparePartId: string, notes?: string): Promise<AssetPart> {
  const { data } = await api.post<AssetPart>(`/instruments/${instrumentId}/parts`, { sparePartId, notes });
  return data;
}

export async function removeAssetPart(instrumentId: string, linkId: string): Promise<void> {
  await api.delete(`/instruments/${instrumentId}/parts/${linkId}`);
}

/** Consumo real (o que ja foi baixado do almoxarifado nas OS deste ativo) - diferente do BOM. */
export async function getInstrumentPartsHistory(instrumentId: string): Promise<AssetPartHistoryEntry[]> {
  const { data } = await api.get<AssetPartHistoryEntry[]>(`/instruments/${instrumentId}/parts-history`);
  return data;
}

/** Gastos totais do ativo (pecas + mao de obra, somados de todas as OS). */
export async function getInstrumentCostSummary(instrumentId: string): Promise<InstrumentCostSummary> {
  const { data } = await api.get<InstrumentCostSummary>(`/instruments/${instrumentId}/cost-summary`);
  return data;
}

// --------------------------------------------------------------------------
// Anexos do ativo: manual, foto do equipamento etc.
// --------------------------------------------------------------------------

export async function listInstrumentAttachments(instrumentId: string): Promise<CalibrationAttachment[]> {
  const { data } = await api.get<CalibrationAttachment[]>(`/instruments/${instrumentId}/attachments`);
  return data;
}

export async function uploadInstrumentAttachment(
  instrumentId: string,
  file: File,
  category: AttachmentCategory,
  caption?: string,
): Promise<CalibrationAttachment> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);
  if (caption) formData.append("caption", caption);
  const { data } = await api.post<CalibrationAttachment>(`/instruments/${instrumentId}/attachments`, formData);
  return data;
}

export async function deleteInstrumentAttachment(instrumentId: string, attachmentId: string): Promise<void> {
  await api.delete(`/instruments/${instrumentId}/attachments/${attachmentId}`);
}

export async function getInstrumentAttachmentUrl(instrumentId: string, attachmentId: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(`/instruments/${instrumentId}/attachments/${attachmentId}/url`);
  return data.url;
}

/** O que esta pendurado no ativo - a tela mostra antes de perguntar "tem certeza?". */
export interface ImpactoDaRemocao {
  filhos: number;
  ordensAbertas: number;
  ordens: number;
  planos: number;
  pontos: number;
}

export async function getImpactoDaRemocao(id: string): Promise<ImpactoDaRemocao> {
  const { data } = await api.get<ImpactoDaRemocao>(`/instruments/${id}/impacto-da-remocao`);
  return data;
}

/** Envia (ou substitui) a foto principal do ativo. */
export async function uploadInstrumentPhoto(id: string, file: File): Promise<Instrument> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<Instrument>(`/instruments/${id}/photo`, form);
  return data;
}

export async function deleteInstrumentPhoto(id: string): Promise<void> {
  await api.delete(`/instruments/${id}/photo`);
}
