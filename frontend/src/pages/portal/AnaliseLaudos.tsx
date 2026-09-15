import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, AlertOctagon, CheckCircle2, FileText, Download } from "lucide-react";
import {
  listDocumentAnalyses,
  uploadAndAnalyzeDocument,
  getDocumentAnalysisUrl,
  type DocumentAnalysisItem,
} from "../../api/documentAnalysis";
import type { InsightSeverity } from "../../api/insights";
import { FullPageSpinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { FileUpload } from "../../components/FileUpload";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { formatDateTime, formatFileSize } from "../../lib/format";

const SEVERITY_META: Record<InsightSeverity, { label: string; icon: typeof CheckCircle2; className: string }> = {
  CRITICAL: { label: "Crítico", icon: AlertOctagon, className: "bg-red-50 text-safety-red ring-1 ring-red-200" },
  ATTENTION: { label: "Atenção", icon: AlertTriangle, className: "bg-amber-50 text-amber-700 ring-1 ring-amber-200" },
  OK: { label: "Ok", icon: CheckCircle2, className: "bg-green-50 text-green-700 ring-1 ring-green-200" },
};

/**
 * Analise de laudos tecnicos (vibracao, oleo, termografia etc.) por IA: o cliente anexa o
 * PDF e recebe um resumo pratico com severidade, direto da leitura do documento. Fica
 * historico - cada laudo novo vira uma linha, sem apagar as analises anteriores.
 *
 * Vive como aba dentro de Preditiva (PredictivePanel.tsx) - as duas telas respondem a
 * mesma pergunta ("qual a condicao do ativo, antes da falha"), uma por sensor e outra por
 * laudo em PDF, entao nao precisam de item proprio no menu.
 */
export function AnaliseLaudosConteudo() {
  const queryClient = useQueryClient();
  const { notify } = useToast();

  const { data: itens, isLoading } = useQuery({ queryKey: ["document-analyses"], queryFn: listDocumentAnalyses });

  const uploadMutation = useMutation({
    mutationFn: uploadAndAnalyzeDocument,
    onSuccess: (novo) => {
      queryClient.setQueryData<DocumentAnalysisItem[]>(["document-analyses"], (atual) => [novo, ...(atual ?? [])]);
      notify("success", "Laudo analisado.");
    },
    onError: (error) => notify("error", getApiErrorMessage(error)),
  });

  async function abrirArquivo(id: string) {
    try {
      const url = await getDocumentAnalysisUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-graphite-500">
        Anexe um laudo técnico (vibração, análise de óleo, termografia...) e receba um resumo prático gerado por IA. Revise antes de agir, nada aqui é automático.
      </p>

      <div className="mb-6">
        <FileUpload
          accept="application/pdf"
          label="Anexar laudo em PDF"
          hint="Até 15 MB - vibração, análise de óleo, termografia ou outro laudo técnico"
          onUpload={(file) => uploadMutation.mutateAsync(file).then(() => undefined)}
        />
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : !itens || itens.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhum laudo analisado ainda"
          description="Anexe um PDF acima para ver como a IA avalia o laudo."
        />
      ) : (
        <div className="space-y-3">
          {itens.map((item) => {
            const meta = SEVERITY_META[item.severity];
            const Icon = meta.icon;
            return (
              <div key={item.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-graphite-400" />
                      <p className="truncate font-semibold text-navy-900">{item.fileName}</p>
                    </div>
                    <p className="mt-2 text-sm text-graphite-600">{item.summary}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-graphite-400">
                    Enviado em {formatDateTime(item.createdAt)} - {formatFileSize(item.sizeBytes)}
                  </p>
                  <button type="button" onClick={() => abrirArquivo(item.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy-700 hover:underline">
                    <Download className="h-3.5 w-3.5" /> Ver arquivo original
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
