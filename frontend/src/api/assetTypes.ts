import { api } from "./client";
import type { AssetType, AssetHierarchyLevel } from "./types";

export async function listAssetTypes(params: { active?: boolean; clientId?: string } = {}): Promise<AssetType[]> {
  const { data } = await api.get<AssetType[]>("/asset-types", { params });
  return data;
}

export interface AssetTypeInput {
  name: string;
  clientId?: string | null;
  level?: AssetHierarchyLevel | null;
  codePrefix?: string | null;
}

export async function createAssetType(input: AssetTypeInput): Promise<AssetType> {
  const { data } = await api.post<AssetType>("/asset-types", input);
  return data;
}

export async function updateAssetType(id: string, input: Partial<AssetTypeInput & { active: boolean }>): Promise<AssetType> {
  const { data } = await api.patch<AssetType>(`/asset-types/${id}`, input);
  return data;
}

export async function deleteAssetType(id: string): Promise<void> {
  await api.delete(`/asset-types/${id}`);
}
