import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, AlertOctagon, CheckCircle2 } from "lucide-react";
import { listInsights, generateInsights, type ClientInsight, type InsightSeverity } from "../../api/insights";
import { PageHeader } from "../../components/PageHeader";
import { FullPageSpinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { formatDateTime, clientDisplayName } from "../../lib/format";

const SEVERITY_META: Record<InsightSeverity, { label: string; icon: typeof CheckCircle2; className: string }> = {
  CRITICAL: { label: "Critico", icon: AlertOctagon, className: "bg-red-50 text-safety-red ring-1 ring-red-200" },
  ATTENTION: { label: "Atencao", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  OK: { label: "Ok", icon: CheckCircle2, className: "bg-green-50 text-green-700 ring-1 ring-green-200" },
};

const SEVERITY_ORDER: Record<InsightSeverity, number> = { CRITICAL: 0, ATTENTION: 1, OK: 2 };

function SeverityBadge({ severity }: { severity: InsightSeverity }) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}

/**
 * Sugestoes de IA por cliente, geradas sob demanda a partir de dados reais do CMMS (planos
 * atrasados, OS abertas, estoque, uso do plano) - nunca dispara acao sozinha, e' so leitura
 * para a equipe decidir o que fazer. Precisa de GEMINI_API_KEY configurada no backend.
 */
export default function InsightsList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const { data: insights, isLoading } = useQuery({ queryKey: ["insights"], queryFn: listInsights });

  const generateMutation = useMutation({
    mutationFn: generateInsights,
    onSuccess: (data) => {
      queryClient.setQueryData(["insights"], data);
      notify("success", "Insights atualizados.");
    },
    onError: (error) => notify("error", getApiErrorMessage(error)),
  });

  const ordenados = [...(insights ?? [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <div>
      <PageHeader
        title="Insights"
        description="Sugestoes geradas por IA a partir dos dados de cada cliente - revise antes de agir, nada aqui e' automatico."
        breadcrumbs={[{ label: "Insights" }]}
        actions={
          <button className="btn-primary" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Sparkles className="h-4 w-4" /> {generateMutation.isPending ? "Gerando..." : "Gerar insights"}
          </button>
        }
      />

      {isLoading ? (
        <FullPageSpinner />
      ) : ordenados.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhum insight gerado ainda"
          description='Clique em "Gerar insights" para analisar os clientes ativos agora.'
        />
      ) : (
        <div className="space-y-3">
          {ordenados.map((insight: ClientInsight) => (
            <div key={insight.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-900">{clientDisplayName(insight.client)}</p>
                  <p className="mt-1 text-sm text-graphite-600">{insight.summary}</p>
                </div>
                <SeverityBadge severity={insight.severity} />
              </div>
              <p className="mt-3 text-xs text-graphite-400">Gerado em {formatDateTime(insight.generatedAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
