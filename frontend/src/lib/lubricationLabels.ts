import type {
  LubricantBase,
  LubricantType,
  LubricationCondition,
  MachineStateForLubrication,
} from "../api/types";

export const TIPOS_DE_LUBRIFICANTE: Record<LubricantType, string> = {
  GREASE: "Graxa",
  OIL: "Óleo",
  OTHER: "Outro",
};

export const BASES_DE_LUBRIFICANTE: Record<LubricantBase, string> = {
  MINERAL: "Mineral",
  SYNTHETIC: "Sintética",
  SEMI_SYNTHETIC: "Semissintética",
};

/** Estado da maquina exigido no ponto. Nao e' burocracia: lubrificar acoplamento girando
 * e' acidente, e o campo existe para a ordem avisar antes de alguem chegar la. */
export const ESTADOS_DA_MAQUINA: Record<MachineStateForLubrication, string> = {
  STOPPED: "Só com a máquina parada",
  RUNNING: "Com a máquina em operação",
  ANY: "Tanto faz",
};

export const CONDICOES_DO_PONTO: Record<LubricationCondition, string> = {
  NORMAL: "Normal",
  LOW: "Nível baixo",
  DRY: "Seco",
  CONTAMINATED: "Contaminado",
  EXCESS: "Excesso",
};
