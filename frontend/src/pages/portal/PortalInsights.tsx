import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, AlertTriangle, AlertOctagon, CheckCircle2 } from "lucide-react";
import { getMyInsight, generateMyInsight, type InsightSeverity } from "../../api/insights";
import { PageHeader } from "../../components/PageHeader";
import { FullPageSpinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { formatDateTime } from "../../lib/format";

const SEVERITY_META: Record<InsightSeverity, { label: string; icon: typeof CheckCircle2; className: string }> = {
  CRITICAL: { label: "Crítico", icon: AlertOctagon, className: "bg-red-50 text-safety-red ring-1 ring-red-200" },
  ATTENTION: { label: "Atenção", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  OK: { label: "Ok", icon: CheckCircle2, className: "bg-green-50 text-green-700 ring-1 ring-green-200" },
};

/**
 * Autoatendimento: o cliente pede uma analise da propria operacao (planos atrasados, OS
 * abertas, estoque, uso do plano) quando quiser - sem depender da equipe RLP gerar por ele.
 * Mesma sugestao de IA que a equipe ve em Administracao > Insights, so' que so' a dele.
 */
export default function PortalInsights() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const { data: insight, isLoading } = useQuery({ queryKey: ["my-insight"], queryFn: getMyInsight });

  const generateMutation = useMutation({
    mutationFn: generateMyInsight,
    onSuccess: (data) => {
      queryClient.setQueryData(["my-insight"], data);
      notify("success", "Análise atualizada.");
    },
    onError: (error) => notify("error", getApiErrorMessage(error)),
  });

  const meta = insight ? SEVERITY_META[insight.severity] : null;
  const Icon = meta?.icon;

  return (
    <div>
      <PageHeader
        title="Insights"
        description="Uma análise da sua operação gerada por IA - planos atrasados, ordens abertas, estoque e uso do plano. Revise antes de agir, nada aqui é automático."
        breadcrumbs={[{ label: "Insights" }]}
        actions={
          <button className="btn-primary" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Sparkles className="h-4 w-4" /> {generateMutation.isPending ? "Analisando..." : "Analisar minha operação"}
          </button>
        }
      />

      {isLoading ? (
        <FullPageSpinner />
      ) : !insight ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhuma análise gerada ainda"
          description='Clique em "Analisar minha operação" para ver como a IA avalia a sua operação agora.'
        />
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base text-graphite-700">{insight.summary}</p>
            {meta && Icon && (
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
                <Icon className="h-3.5 w-3.5" /> {meta.label}
              </span>
            )}
          </div>
          <p className="mt-4 text-xs text-graphite-400">Gerado em {formatDateTime(insight.generatedAt)}</p>
        </div>
      )}
    </div>
  );
}
