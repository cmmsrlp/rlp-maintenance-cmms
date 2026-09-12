import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Um login novo nesta mesma conta, de outro lugar, derruba a sessao atual na hora (a API
// responde 401/SESSION_REPLACED na proxima chamada). Sem isso, a aba continuaria de pe,
// falhando silenciosamente a cada acao, sem a pessoa entender por que.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const codigo = axios.isAxiosError(error) ? (error.response?.data as ApiErrorPayload | undefined)?.code : undefined;
    if (codigo === "SESSION_REPLACED" && !window.location.pathname.startsWith("/entrar")) {
      window.location.href = "/entrar?motivo=outro-local";
    }
    return Promise.reject(error);
  },
);

export interface ApiErrorPayload {
  message: string;
  code?: string;
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
}

export function getApiErrorMessage(error: unknown, fallback = "Ocorreu um erro. Tente novamente."): string {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ApiErrorPayload | undefined;
    if (payload?.message) return payload.message;
  }
  return fallback;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
