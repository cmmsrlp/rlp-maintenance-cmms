import { api } from "./client";
import type { AuthUser } from "./types";

export async function login(email: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<{ user: AuthUser }>("/auth/login", { email, password });
  return data.user;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function fetchMe(): Promise<AuthUser> {
  const { data } = await api.get<{ user: AuthUser }>("/auth/me");
  return data.user;
}

/** Troca da propria senha (exige a senha atual). */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post("/auth/change-password", { currentPassword, newPassword });
}

/** Publica (sem login) - pede senha temporaria por e-mail. */
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}
