import { api } from "./client";
import type { InsightSeverity } from "./insights";

export interface DocumentAnalysisItem {
  id: string;
  clientId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  severity: InsightSeverity;
  summary: string;
  createdAt: string;
}

export async function listDocumentAnalyses(): Promise<DocumentAnalysisItem[]> {
  const { data } = await api.get<DocumentAnalysisItem[]>("/document-analyses");
  return data;
}

/** Envia o laudo (PDF) e ja' recebe a analise da IA pronta - uma unica chamada. */
export async function uploadAndAnalyzeDocument(file: File): Promise<DocumentAnalysisItem> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<DocumentAnalysisItem>("/document-analyses", form);
  return data;
}

export async function getDocumentAnalysisUrl(id: string): Promise<string> {
  const { data } = await api.get<{ url: string }>(`/document-analyses/${id}/url`);
  return data.url;
}
