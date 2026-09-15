import type { RotableEquipment } from "../api/types";

/**
 * "Em reparo" sozinho nao diz se o fornecedor ja respondeu com o orcamento ou se o
 * equipamento acabou de sair e ainda nao tem nem numero nem valor - a pessoa so descobria
 * abrindo a ficha do equipamento. Aqui devolve um rotulo mais especifico quando a ordem
 * de reparo aberta ainda nao tem valor orcado; undefined nos outros casos, para o
 * StatusBadge usar o rotulo padrao do status.
 */
export function rotuloDeStatusRotable(rotable: Pick<RotableEquipment, "status" | "openRepairOrder">): string | undefined {
  if (rotable.status === "IN_RECONDITIONING" && rotable.openRepairOrder && rotable.openRepairOrder.budgetValue == null) {
    return "Em reparo - aguardando orçamento";
  }
  return undefined;
}
