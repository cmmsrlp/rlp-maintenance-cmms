import { api, type PagedResult } from "./client";
import type { AssetCriticality, AssetCriticalityListItem, CriticalityClass } from "./types";

export async function listCriticalities(params: {
  clientId?: string;
  plantId?: string;
  areaId?: string;
  class?: CriticalityClass;
  insufficient?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PagedResult<AssetCriticalityListItem>> {
  const { data } = await api.get<PagedResult<AssetCriticalityListItem>>("/asset-criticality", { params });
  return data;
}

export interface CriticalitySummary {
  classA: number;
  classB: number;
  classC: number;
  insufficient: number;
  total: number;
}

export async function getCriticalitySummary(params: { clientId?: string } = {}): Promise<CriticalitySummary> {
  const { data } = await api.get<CriticalitySummary>("/asset-criticality/resumo", { params });
  return data;
}

export interface CriticalityDetail {
  instrument: {
    id: string;
    tag: string | null;
    description: string | null;
    type: string;
    status: string;
    operationalStatus: string;
    plant: { id: string; name: string } | null;
    area: { id: string; name: string } | null;
  };
  criticality: AssetCriticality | null;
  /** MTBF-meta que esta valendo agora (propria, se definida, ou a media da familia). */
  mtbfTargetResolved: number | null;
}

export async function getCriticality(instrumentId: string): Promise<CriticalityDetail> {
  const { data } = await api.get<CriticalityDetail>(`/asset-criticality/${instrumentId}`);
  return data;
}

export interface ReviewCriticalityInput {
  safetyScore?: number;
  safetyNotes?: string | null;
  productionScore?: number;
  productionNotes?: string | null;
  failureScoreMode?: "AUTO" | "MANUAL";
  failureScore?: number | null;
  mtbfTargetHours?: number | null;
  reason?: string;
}

export async function reviewCriticality(instrumentId: string, input: ReviewCriticalityInput): Promise<AssetCriticality> {
  const { data } = await api.patch<AssetCriticality>(`/asset-criticality/${instrumentId}`, input);
  return data;
}

export async function recalculateCriticality(instrumentId: string): Promise<AssetCriticality> {
  const { data } = await api.post<AssetCriticality>(`/asset-criticality/${instrumentId}/recalcular`);
  return data;
}

export interface FiltrosDeExportacao {
  clientId?: string;
  plantId?: string;
  areaId?: string;
  class?: CriticalityClass;
  insufficient?: boolean;
  search?: string;
}

export async function exportarCriticidades(params: FiltrosDeExportacao = {}): Promise<Blob> {
  const { data } = await api.get("/asset-criticality/exportar", { params, responseType: "blob" });
  return data as Blob;
}

export interface LinhaDoResultadoDeImportacao {
  numero: number;
  tag: string;
  status: "alterado" | "sem_alteracao" | "erro";
  mensagem?: string;
  antes?: { safetyScore: number; productionScore: number; mtbfTargetHours: number | null };
  depois?: { safetyScore: number; productionScore: number; mtbfTargetHours: number | null };
}

export interface ResultadoDaImportacao {
  resumo: { total: number; alterados: number; semAlteracao: number; comErro: number };
  linhas: LinhaDoResultadoDeImportacao[];
}

export async function simularImportacaoDeCriticidade(file: File): Promise<ResultadoDaImportacao> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ResultadoDaImportacao>("/asset-criticality/importar/simular", form);
  return data;
}

export async function confirmarImportacaoDeCriticidade(file: File): Promise<ResultadoDaImportacao> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ResultadoDaImportacao>("/asset-criticality/importar/confirmar", form);
  return data;
}
