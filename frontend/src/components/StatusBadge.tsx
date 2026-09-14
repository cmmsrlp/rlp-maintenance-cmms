type Tone = "green" | "yellow" | "red" | "graphite" | "navy";

const TONE_CLASSES: Record<Tone, string> = {
  green: "bg-green-50 text-safety-green-dark border-green-200",
  yellow: "bg-amber-50 text-safety-yellow-dark border-amber-200",
  red: "bg-red-50 text-safety-red border-red-200",
  graphite: "bg-graphite-100 text-graphite-600 border-graphite-200",
  navy: "bg-navy-50 text-navy-700 border-navy-200",
};

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // genericos
  ACTIVE: { label: "Ativo", tone: "green" },
  INACTIVE: { label: "Inativo", tone: "graphite" },
  PROSPECT: { label: "Prospecto", tone: "navy" },
  CANCELED: { label: "Cancelado", tone: "red" },
  // instrumentos / calibracao / contratos (status derivado por vencimento)
  VALID: { label: "Valido", tone: "green" },
  DUE_SOON: { label: "Proximo do vencimento", tone: "yellow" },
  EXPIRED: { label: "Vencido", tone: "red" },
  EXPIRING_SOON: { label: "Vencendo em breve", tone: "yellow" },
  IN_MAINTENANCE: { label: "Em manutencao", tone: "navy" },
  // condicao operacional do ativo (independente do status de calibracao acima)
  IN_OPERATION: { label: "Em operacao", tone: "green" },
  STOPPED: { label: "Parado", tone: "red" },
  STANDBY: { label: "Reserva", tone: "navy" },
  DEACTIVATED: { label: "Desativado", tone: "graphite" },
  // solicitacao de servico (SS) - REJECTED e' compartilhado com laudo/calibracao
  // (rotulo generico "Reprovado"); use o prop `label` pra sobrescrever com "Rejeitada".
  OPEN: { label: "Aberta", tone: "navy" },
  IN_TRIAGE: { label: "Em triagem", tone: "yellow" },
  AWAITING_INFO: { label: "Aguardando informacao", tone: "yellow" },
  PLANNED: { label: "Planejada", tone: "navy" },
  CONVERTED: { label: "Convertida em OS", tone: "green" },
  CLOSED: { label: "Encerrada", tone: "graphite" },
  // ordem de manutencao (OS do CMMS) - IN_TRIAGE e PLANNED ja definidos acima (SS)
  PROGRAMMED: { label: "Programada", tone: "navy" },
  RELEASED: { label: "Liberada", tone: "navy" },
  AWAITING_MATERIAL: { label: "Aguardando material", tone: "yellow" },
  AWAITING_RELEASE: { label: "Aguardando liberacao", tone: "yellow" },
  AWAITING_STOPPAGE: { label: "Aguardando parada", tone: "yellow" },
  // ordem de servico
  BUDGET: { label: "Orcamento", tone: "graphite" },
  APPROVED: { label: "Aprovada", tone: "navy" },
  SCHEDULED: { label: "Agendada", tone: "navy" },
  IN_PROGRESS: { label: "Em andamento", tone: "yellow" },
  COMPLETED: { label: "Concluida", tone: "green" },
  // laudos / certificados
  DRAFT: { label: "Rascunho", tone: "graphite" },
  ISSUED: { label: "Emitido", tone: "green" },
  APPROVED_WITH_RESTRICTION: { label: "Aprovado com ressalva", tone: "yellow" },
  REJECTED: { label: "Reprovado", tone: "red" },
  // produtos
  UNAVAILABLE: { label: "Indisponivel", tone: "graphite" },
  // orcamentos / pedidos
  NEW: { label: "Novo", tone: "navy" },
  IN_ANALYSIS: { label: "Em analise", tone: "yellow" },
  QUOTE_SENT: { label: "Orcamento enviado", tone: "navy" },
  SEPARATED: { label: "Separado", tone: "yellow" },
  DELIVERED: { label: "Entregue", tone: "green" },
  PENDING: { label: "Pendente", tone: "graphite" },
  PAID: { label: "Pago", tone: "green" },
  // pontos de calibracao
  PASS: { label: "Aprovado", tone: "green" },
  FAIL: { label: "Reprovado", tone: "red" },
  // equipamento recondicionavel
  IN_STOCK: { label: "Em estoque", tone: "navy" },
  INSTALLED: { label: "Instalado", tone: "green" },
  QUARANTINE: { label: "Quarentena", tone: "yellow" },
  IN_RECONDITIONING: { label: "Em reparo", tone: "yellow" },
  SCRAPPED: { label: "Sucateado", tone: "red" },
  // ordem de reparo - resultado (PENDING/APPROVED/REJECTED do orcamento reaproveitam as
  // entradas ja existentes acima)
  REPAIRED: { label: "Reparado", tone: "green" },
  PARTIALLY_REPAIRED: { label: "Reparo parcial", tone: "yellow" },
  // cronograma de parada programada (IN_PROGRESS reaproveita a entrada de ordem de servico)
  PLANNING: { label: "Planejamento", tone: "navy" },
  DONE: { label: "Concluido", tone: "green" },
  // criticidade do ativo / prioridade da OS (mesma escala nos dois)
  LOW: { label: "Baixa", tone: "graphite" },
  MEDIUM: { label: "Media", tone: "navy" },
  HIGH: { label: "Alta", tone: "yellow" },
  CRITICAL: { label: "Critica", tone: "red" },
};

/** Mesmo texto que o badge mostra, pra reaproveitar em CSV/relatorio sem duplicar o mapa. */
export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = STATUS_MAP[status] ?? { label: label ?? status, tone: "graphite" as Tone };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[meta.tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? meta.label}
    </span>
  );
}
