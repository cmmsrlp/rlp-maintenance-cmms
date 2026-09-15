import type { ServiceRequestStatus } from "../api/types";

/**
 * REJECTED e CANCELED reaproveitam os rotulos genericos do StatusBadge ("Reprovado" e
 * "Cancelado"), que nao concordam em genero com "solicitação". Aqui devolve o rotulo
 * certo pros dois; undefined nos outros casos, para o StatusBadge usar o rotulo padrao.
 */
export function rotuloDoStatusSS(status: ServiceRequestStatus): string | undefined {
  if (status === "REJECTED") return "Rejeitada";
  if (status === "CANCELED") return "Cancelada";
  return undefined;
}
