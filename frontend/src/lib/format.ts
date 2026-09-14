export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Sob consulta";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Fuso fixo de exibicao: o sistema e' usado por empresas no Brasil, e depender do fuso do
// SISTEMA OPERACIONAL de quem esta olhando a tela (em vez de sempre mostrar horario de
// Brasilia) foi exatamente a causa de uma data/hora aparecer deslocada em 3h numa auditoria
// - o navegador de quem testava nao estava com o relogio em America/Sao_Paulo. Fixando aqui,
// a exibicao fica correta em qualquer maquina, sem depender de configuracao alheia.
const FUSO_BRASIL = "America/Sao_Paulo";

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("pt-BR", { timeZone: FUSO_BRASIL });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: FUSO_BRASIL });
}

/** Componentes YYYY-MM-DD / HH:mm de um instante (ISO ou Date) na hora de Sao Paulo - para
 * pre-preencher <input type="date"> / <input type="datetime-local"> ao editar um registro.
 * Esses inputs nao entendem fuso horario (sao "hora de parede" pura); usar os getters de
 * UTC depois de deslocar o relogio em -3h da exatamente essa hora de parede, sem depender
 * do fuso do navegador de quem esta editando. */
export function paraInputDeDataSaoPaulo(value: string | Date | null | undefined): { data: string; horaMinuto: string } {
  if (!value) return { data: "", horaMinuto: "" };
  const instante = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instante.getTime())) return { data: "", horaMinuto: "" };
  const deslocado = new Date(instante.getTime() - 3 * 60 * 60 * 1000);
  const iso = deslocado.toISOString();
  return { data: iso.slice(0, 10), horaMinuto: iso.slice(0, 16) };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  ELECTRICAL_MAINTENANCE: "Manutencao eletrica",
  PANEL_MAINTENANCE: "Manutencao de paineis",
  MOTOR_MAINTENANCE: "Manutencao de motores",
  TECHNICAL_REPORT: "Laudo tecnico",
  CALIBRATION: "Calibracao",
  TECHNICAL_ASSISTANCE: "Assistencia tecnica",
  EV_CHARGER: "Carregador veicular",
  CMMS_MAINTENANCE: "RLP Maintenance CMMS",
  OTHER: "Outros",
};

export function formatServiceCategory(value: string): string {
  return SERVICE_CATEGORY_LABELS[value] ?? value;
}

const TECHNICAL_REPORT_CATEGORY_LABELS: Record<string, string> = {
  ELECTRICAL_INSTALLATION: "Instalacoes eletricas",
  THERMOGRAPHY: "Termografia infravermelha",
  GROUNDING: "Aterramento eletrico",
  SPDA: "SPDA (para-raios)",
  OTHER: "Outros relatorios",
};

export function formatReportCategory(value: string): string {
  return TECHNICAL_REPORT_CATEGORY_LABELS[value] ?? value;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  TECHNICIAN: "Tecnico",
  COMMERCIAL: "Comercial",
  CLIENT: "Cliente",
};

export function formatRole(value: string): string {
  return ROLE_LABELS[value] ?? value;
}

export function clientDisplayName(client: { companyName: string; tradeName?: string | null } | null | undefined): string {
  if (!client) return "-";
  return client.tradeName || client.companyName;
}

/** Indicador que pode nao ter base de calculo. Zero e' um numero com significado (MTBF 0h
 * = quebra o tempo todo); ausencia de dado precisa parecer ausencia de dado. */
export function formatKpi(valor: number | null | undefined, sufixo = ""): string {
  if (valor == null) return "sem dados";
  return `${valor}${sufixo}`;
}
