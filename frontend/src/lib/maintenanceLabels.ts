import type { CorrectiveType, MaintenanceOrderType, MaintenancePlanType, FailureSeverity, LubricationMethod,
  WorkOrderExecutionCondition,
  MaintenanceOrderStatus,
  PredictiveTechnique,
} from "../api/types";

export const TECNICAS_PREDITIVAS: Record<PredictiveTechnique, string> = {
  COUNTER: "Contador",
  VIBRATION: "Vibracao",
  THERMOGRAPHY: "Termografia",
  OIL_ANALYSIS: "Analise de oleo",
  ULTRASOUND: "Ultrassom",
  MOTOR_CURRENT: "Corrente do motor",
  VISUAL: "Inspecao visual",
  OTHER: "Outra",
};

/** Rotulos dos tipos de servico. Ficam num arquivo so porque apareciam repetidos em cada
 * tela - e, repetidos, saiam de sincronia toda vez que um tipo novo entrava. */
export const TIPOS_DE_OS: Record<MaintenanceOrderType, string> = {
  CORRECTIVE: "Corretiva",
  PREVENTIVE: "Preventiva",
  PREDICTIVE: "Preditiva",
  LUBRICATION: "Lubrificacao",
  INSPECTION: "Inspecao",
  PROJECT: "Projeto",
};

export const TIPOS_DE_CORRETIVA: Record<CorrectiveType, string> = {
  IN_OPERATION: "Em operacao",
  BREAKDOWN: "De quebra",
};

/** Um unico seletor para o usuario: a corretiva aparece ja separada em operacao/quebra,
 * porque na cabeca de quem abre a OS sao dois tipos de servico, nao um tipo com um
 * atributo. No banco continuam sendo dois campos, para que tudo que analisa "corretiva"
 * (Pareto, MTTR, disponibilidade) continue enxergando as duas. */
export const OPCOES_DE_TIPO: { valor: string; rotulo: string; type: MaintenanceOrderType; correctiveType: CorrectiveType | null }[] = [
  { valor: "CORRECTIVE_IN_OPERATION", rotulo: "Corretiva - em operacao", type: "CORRECTIVE", correctiveType: "IN_OPERATION" },
  { valor: "CORRECTIVE_BREAKDOWN", rotulo: "Corretiva - de quebra", type: "CORRECTIVE", correctiveType: "BREAKDOWN" },
  { valor: "PREVENTIVE", rotulo: "Preventiva", type: "PREVENTIVE", correctiveType: null },
  { valor: "PREDICTIVE", rotulo: "Preditiva", type: "PREDICTIVE", correctiveType: null },
  { valor: "LUBRICATION", rotulo: "Lubrificacao", type: "LUBRICATION", correctiveType: null },
  { valor: "INSPECTION", rotulo: "Inspecao", type: "INSPECTION", correctiveType: null },
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
  { valor: "CRITICAL", rotulo: "Critica - parada total" },
  { valor: "HIGH", rotulo: "Alta - risco de parada" },
  { valor: "MODERATE", rotulo: "Media - degradacao" },
  { valor: "LOW", rotulo: "Baixa - sem impacto" },
];

export const TIPOS_DE_PLANO: Record<MaintenancePlanType, string> = {
  PREVENTIVE: "Preventiva",
  PREDICTIVE: "Preditiva",
  INSPECTION: "Inspecao",
  LUBRICATION: "Lubrificacao",
  CALIBRATION: "Calibracao",
  ELECTRICAL: "Eletrica",
  MECHANICAL: "Mecanica",
  REGULATORY: "Regulatoria",
  OTHER: "Outro",
};

export const METODOS_DE_LUBRIFICACAO: Record<LubricationMethod, string> = {
  MANUAL_GUN: "Manual (pistola)",
  AUTOMATIC_CENTRAL: "Automatico (centralizado)",
  OIL_BATH: "Banho de oleo",
  IMMERSION: "Imersao",
  BRUSH: "Pincel",
  SPRAY: "Borrifador",
};

/** Como o servico sera executado - decisao do planejador na conversao da solicitacao. */
export const CONDICOES_DE_EXECUCAO: Record<WorkOrderExecutionCondition, string> = {
  MACHINE_RUNNING: "Com a maquina em operacao",
  OPPORTUNITY_STOP: "Na proxima parada de oportunidade",
  PLANNED_SHUTDOWN: "So na parada programada",
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
  { valor: "IN_TRIAGE", rotulo: "Em triagem", ajuda: "Alguem ainda vai decidir o que fazer" },
  { valor: "PLANNED", rotulo: "Planejada", ajuda: "Sabe-se o que fazer; falta programar" },
  { valor: "PROGRAMMED", rotulo: "Programada", ajuda: "Com data na programacao" },
  { valor: "RELEASED", rotulo: "Liberada", ajuda: "Pode ser executada agora" },
  { valor: "IN_PROGRESS", rotulo: "Em execucao", ajuda: "Ja esta sendo feita" },
  { valor: "AWAITING_MATERIAL", rotulo: "Aguardando material", ajuda: "Parada esperando peca ou compra" },
  { valor: "AWAITING_RELEASE", rotulo: "Aguardando liberacao", ajuda: "Esperando autorizacao da operacao" },
  { valor: "AWAITING_STOPPAGE", rotulo: "Aguardando parada", ajuda: "So na proxima parada da maquina" },
];
