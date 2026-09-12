import { api } from "./client";

export type InsightSeverity = "OK" | "ATTENTION" | "CRITICAL";

export interface ClientInsight {
  id: string;
  clientId: string;
  severity: InsightSeverity;
  summary: string;
  generatedAt: string;
  client: { id: string; companyName: string; tradeName: string | null };
}

export async function listInsights(): Promise<ClientInsight[]> {
  const { data } = await api.get<ClientInsight[]>("/insights");
  return data;
}

export async function generateInsights(): Promise<ClientInsight[]> {
  const { data } = await api.post<ClientInsight[]>("/insights/generate");
  return data;
}

/** Autoatendimento do portal: o cliente ve/gera so' o proprio insight. */
export async function getMyInsight(): Promise<ClientInsight | null> {
  const { data } = await api.get<ClientInsight | null>("/insights/mine");
  return data;
}

export async function generateMyInsight(): Promise<ClientInsight> {
  const { data } = await api.post<ClientInsight>("/insights/mine/generate");
  return data;
}
