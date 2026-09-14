import type { CorrectiveType, MaintenanceOrderType, MaintenancePlanType, FailureSeverity, LubricationMethod,
  WorkOrderExecutionCondition,
  MaintenanceOrderStatus,
  PredictiveTechnique,
} from "../api/types";

export const TECNICAS_PREDITIVAS: Record<PredictiveTechnique, string> = {
  COUNTER: "Contador",
  VIBRATION: "Vibração",
  THERMOGRAPHY: "Termografia",
  OIL_ANALYSIS: "Análise de óleo",
  ULTRASOUND: "Ultrassom",
  MOTOR_CURRENT: "Corrente do motor",
  VISUAL: "Inspeção visual",
  OTHER: "Outra",
};

/** Rotulos dos tipos de servico. Ficam num arquivo so porque apareciam repetidos em cada
 * tela - e, repetidos, saiam de sincronia toda vez que um tipo novo entrava. */
export const TIPOS_DE_OS: Record<MaintenanceOrderType, string> = {
  CORRECTIVE: "Corretiva",
  PREVENTIVE: "Preventiva",
  PREDICTIVE: "Preditiva",
  LUBRICATION: "Lubrificação",
  INSPECTION: "Inspeção",
  PROJECT: "Projeto",
};

export const TIPOS_DE_CORRETIVA: Record<CorrectiveType, string> = {
  IN_OPERATION: "Em operação",
  BREAKDOWN: "De quebra",
};

/** Um unico seletor para o usuario: a corretiva aparece ja separada em operacao/quebra,
 * porque na cabeca de quem abre a OS sao dois tipos de servico, nao um tipo com um
 * atributo. No banco continuam sendo dois campos, para que tudo que analisa "corretiva"
 * (Pareto, MTTR, disponibilidade) continue enxergando as duas. */
export const OPCOES_DE_TIPO: { valor: string; rotulo: string; type: MaintenanceOrderType; correctiveType: CorrectiveType | null }[] = [
  { valor: "CORRECTIVE_IN_OPERATION", rotulo: "Corretiva - em operação", type: "CORRECTIVE", correctiveType: "IN_OPERATION" },
  { valor: "CORRECTIVE_BREAKDOWN", rotulo: "Corretiva - de quebra", type: "CORRECTIVE", correctiveType: "BREAKDOWN" },
  { valor: "PREVENTIVE", rotulo: "Preventiva", type: "PREVENTIVE", correctiveType: null },
  { valor: "PREDICTIVE", rotulo: "Preditiva", type: "PREDICTIVE", correctiveType: null },
  { valor: "LUBRICATION", rotulo: "Lubrificação", type: "LUBRICATION", correctiveType: null },
  { valor: "INSPECTION", rotulo: "Inspeção", type: "INSPECTION", correctiveType: null },
  { valor: "PROJECT", rotulo: "Projeto", type: "PROJECT", correctiveType: null },
];

export function valorDoTipo(type: MaintenanceOrderType, correctiveType: CorrectiveType | null | undefined): string {
  if (type !== "CORRECTIVE") return type;
  // OS corretiva antiga, aberta antes da distincao: fica sem escolha ate alguem classificar.
  return correctiveType ? `CORRECTIVE_${correctiveType}` : "";
}

export function rotuloDoTipo(type: MaintenanceOrderType, correctiveType?: CorrectiveType | null): string {
  if (type !== "CORRECTIVE") return TIPOS_DE_OS[type] ?? type;
  return correctiveType ? `Corretiva - ${TIPOS_DE_CORRETIVA[correctiveType].toLowerCase()}` : "Corretiva";
}

/** Escala do impacto da falha, com o significado escrito - "Alta" sozinho cada um entende
 * de um jeito. */
export const GRAVIDADES_DE_FALHA: { valor: FailureSeverity; rotulo: string }[] = [
  { valor: "CRITICAL", rotulo: "Crítica - parada total" },
  { valor: "HIGH", rotulo: "Alta - risco de parada" },
  { valor: "MODERATE", rotulo: "Média - degradação" },
  { valor: "LOW", rotulo: "Baixa - sem impacto" },
];

export const TIPOS_DE_PLANO: Record<MaintenancePlanType, string> = {
  PREVENTIVE: "Preventiva",
  PREDICTIVE: "Preditiva",
  INSPECTION: "Inspeção",
  LUBRICATION: "Lubrificação",
  CALIBRATION: "Calibração",
  ELECTRICAL: "Elétrica",
  MECHANICAL: "Mecânica",
  REGULATORY: "Regulatória",
  OTHER: "Outro",
};

export const METODOS_DE_LUBRIFICACAO: Record<LubricationMethod, string> = {
  MANUAL_GUN: "Manual (pistola)",
  AUTOMATIC_CENTRAL: "Automático (centralizado)",
  OIL_BATH: "Banho de óleo",
  IMMERSION: "Imersão",
  BRUSH: "Pincel",
  SPRAY: "Borrifador",
};

/** Como o servico sera executado - decisao do planejador na conversao da solicitacao. */
export const CONDICOES_DE_EXECUCAO: Record<WorkOrderExecutionCondition, string> = {
  MACHINE_RUNNING: "Com a máquina em operação",
  OPPORTUNITY_STOP: "Na próxima parada de oportunidade",
  PLANNED_SHUTDOWN: "Só na parada programada",
};

/**
 * Situacoes que uma OS pode ter ao ser ABERTA.
 *
 * Concluida e Cancelada ficam de fora: concluir tem regras proprias (checklist resolvido,
 * registro de falha na quebra) e cancelar no ato de criar nao e' um registro, e' um
 * formulario preenchido a toa. As duas continuam disponiveis na ficha da OS.
 */
export const SITUACOES_DE_ABERTURA: { valor: MaintenanceOrderStatus; rotulo: string; ajuda: string }[] = [
  { valor: "OPEN", rotulo: "Aberta", ajuda: "Registrada, ainda sem planejamento" },
  { valor: "IN_TRIAGE", rotulo: "Em triagem", ajuda: "Alguém ainda vai decidir o que fazer" },
  { valor: "PLANNED", rotulo: "Planejada", ajuda: "Sabe-se o que fazer; falta programar" },
  { valor: "PROGRAMMED", rotulo: "Programada", ajuda: "Com data na programação" },
  { valor: "RELEASED", rotulo: "Liberada", ajuda: "Pode ser executada agora" },
  { valor: "IN_PROGRESS", rotulo: "Em execução", ajuda: "Já está sendo feita" },
  { valor: "AWAITING_MATERIAL", rotulo: "Aguardando material", ajuda: "Parada esperando peça ou compra" },
  { valor: "AWAITING_RELEASE", rotulo: "Aguardando liberação", ajuda: "Esperando autorização da operação" },
  { valor: "AWAITING_STOPPAGE", rotulo: "Aguardando parada", ajuda: "Só na próxima parada da máquina" },
];
