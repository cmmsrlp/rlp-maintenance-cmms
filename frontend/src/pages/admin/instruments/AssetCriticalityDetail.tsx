import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, Pencil, ChevronDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getCriticality, reviewCriticality, recalculateCriticality } from "../../../api/assetCriticality";
import { getApiErrorMessage } from "../../../api/client";
import { PageHeader } from "../../../components/PageHeader";
import { Modal } from "../../../components/Modal";
import { CriticalityClassBadge } from "../../../components/CriticalityClassBadge";
import { StatusBadge } from "../../../components/StatusBadge";
import { SelectInput, TextInput, TextareaInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { formatDateTime } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

const TRIGGER_LABELS: Record<string, string> = {
  INITIAL: "Primeira avaliacao",
  OS_CLOSED_WITH_FAILURE: "OS de quebra encerrada",
  HOURS_UPDATED: "Horas operadas atualizadas",
  EQUIPMENT_MOVED: "Equipamento movimentado/substituido",
  MANUAL_REVIEW: "Revisao manual",
};

const schema = z
  .object({
    safetyScore: z.coerce.number().int().min(1).max(5),
    safetyNotes: z.string().optional(),
    productionScore: z.coerce.number().int().min(1).max(5),
    productionNotes: z.string().optional(),
    failureScoreMode: z.enum(["AUTO", "MANUAL"]),
    failureScore: z.coerce.number().int().min(1).max(5).optional(),
    // Texto livre em vez de numero: em branco = nao mexe na meta gravada; "0" = limpa a
    // meta propria (volta a usar a media da familia); numero = define a meta propria.
    mtbfTargetHours: z.string().optional(),
    // Toda revisao manual (S, P, meta ou Q) exige justificativa - fica no historico com
    // responsavel e data.
    reason: z.string().min(3, "Explique o motivo da revisao."),
  })
  .refine((d) => d.failureScoreMode !== "MANUAL" || !!d.failureScore, {
    message: "Informe a nota de falha para sobrescrever o cálculo automático.",
    path: ["failureScore"],
  });
type FormValues = z.infer<typeof schema>;

const NOTA_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }));

/**
 * Ficha de criticidade de um ativo: nota atual, classe, calculo utilizado, tendencia e o
 * historico completo de mudancas (automaticas e manuais). A revisao manual so cobre S/P
 * (sem formula no escopo) e, opcionalmente, Q (sobrepondo o calculo automatico ate alguem
 * voltar o modo para automatico).
 */
export default function AssetCriticalityDetail() {
  const { instrumentId } = useParams<{ instrumentId: string }>();
  const { assetsBase } = useCmms();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["asset-criticality-detail", instrumentId],
    queryFn: () => getCriticality(instrumentId!),
    enabled: !!instrumentId,
  });

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function abrirRevisao() {
    const c = data?.criticality;
    reset({
      safetyScore: (c?.safetyScore ?? 1) as unknown as number,
      safetyNotes: c?.safetyNotes ?? "",
      productionScore: (c?.productionScore ?? 1) as unknown as number,
      productionNotes: c?.productionNotes ?? "",
      failureScoreMode: c?.failureScoreOrigin ?? "AUTO",
      failureScore: (c?.failureScore ?? undefined) as unknown as number | undefined,
      mtbfTargetHours: c?.mtbfTargetHours != null ? String(Math.round(c.mtbfTargetHours)) : "",
      reason: "",
    });
    setReviewOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const mtbfTexto = values.mtbfTargetHours?.trim() ?? "";
    const mtbfTargetHours = mtbfTexto === "" ? undefined : mtbfTexto === "0" ? null : Number(mtbfTexto);
    try {
      await reviewCriticality(instrumentId!, {
        safetyScore: values.safetyScore,
        safetyNotes: values.safetyNotes || null,
        productionScore: values.productionScore,
        productionNotes: values.productionNotes || null,
        failureScoreMode: values.failureScoreMode,
        failureScore: values.failureScoreMode === "MANUAL" ? values.failureScore : undefined,
        mtbfTargetHours,
        reason: values.reason || undefined,
      });
      notify("success", "Criticidade revisada.");
      setReviewOpen(false);
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-detail", instrumentId] });
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-lista"] });
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-resumo"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function recalcular() {
    if (!instrumentId) return;
    setRecalculating(true);
    try {
      await recalculateCriticality(instrumentId);
      notify("success", "Criticidade recalculada.");
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-detail", instrumentId] });
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-lista"] });
      queryClient.invalidateQueries({ queryKey: ["asset-criticality-resumo"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setRecalculating(false);
    }
  }

  const failureScoreMode = watch("failureScoreMode");

  if (isLoading || !data) {
    return <div className="animate-pulse space-y-3"><div className="h-8 w-64 rounded bg-gray-100" /><div className="h-40 rounded bg-gray-100" /></div>;
  }

  const { instrument, criticality, mtbfTargetResolved } = data;
  const consequencia = criticality ? Math.max(criticality.safetyScore, criticality.productionScore) : null;
  const metaPropria = criticality?.mtbfTargetHours != null;
  const razaoMtbf = criticality?.mtbfHours != null && mtbfTargetResolved ? criticality.mtbfHours / mtbfTargetResolved : null;

  return (
    <div>
      <PageHeader
        title={instrument.tag ?? instrument.description ?? instrument.type}
        description="Criticidade de ativos"
        breadcrumbs={[
          { label: "Ativos", to: assetsBase },
          { label: "Criticidade de ativos", to: `${assetsBase}/criticidade` },
          { label: instrument.tag ?? instrument.type },
        ]}
        actions={
          <>
            <button className="btn-outline" onClick={recalcular} disabled={recalculating}>
              <RefreshCw className={`h-4 w-4 ${recalculating ? "animate-spin" : ""}`} /> Recalcular
            </button>
            <button className="btn-primary" onClick={abrirRevisao}>
              <Pencil className="h-4 w-4" /> Revisar avaliacao manual
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <p className="text-xs font-medium text-graphite-500">Classe atual</p>
          <div className="mt-2">
            <CriticalityClassBadge criticalityClass={criticality?.criticalityClass} />
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-graphite-500">Índice</dt><dd className="font-medium text-navy-900">{criticality?.criticalityIndex ?? "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-graphite-500">Local</dt><dd className="text-navy-900">{[instrument.plant?.name, instrument.area?.name].filter(Boolean).join(" / ") || "-"}</dd></div>
            <div className="flex justify-between"><dt className="text-graphite-500">Status do ativo</dt><dd><StatusBadge status={instrument.operationalStatus} /></dd></div>
            <div className="flex justify-between"><dt className="text-graphite-500">Atualizado em</dt><dd className="text-navy-900">{formatDateTime(criticality?.lastCalculatedAt)}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <p className="text-xs font-medium text-graphite-500">Notas e calculo utilizado</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-navy-50 p-3 text-center">
              <p className="text-xs text-navy-700">Segurança (S)</p>
              <p className="text-xl font-bold text-navy-900">{criticality?.safetyScore ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-navy-50 p-3 text-center">
              <p className="text-xs text-navy-700">Produção (P)</p>
              <p className="text-xl font-bold text-navy-900">{criticality?.productionScore ?? "-"}</p>
            </div>
            <div className="rounded-lg bg-navy-50 p-3 text-center">
              <p className="text-xs text-navy-700">Falhas (Q)</p>
              <p className="text-xl font-bold text-navy-900">{criticality?.failureScore ?? "sem dados"}</p>
              <p className="text-[10px] text-navy-500">{criticality?.failureScoreOrigin === "MANUAL" ? "Manual" : "Automático"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-gray-200 p-3 font-mono text-xs text-graphite-600">
            <p>Consequencia C = max(S, P) = {consequencia ?? "-"}</p>
            <p>
              Q = razao MTBF real / MTBF-meta = {criticality?.mtbfHours != null ? Math.round(criticality.mtbfHours) : "-"} / {mtbfTargetResolved ? Math.round(mtbfTargetResolved) : "-"}
              {razaoMtbf != null && ` = ${razaoMtbf.toFixed(2)}`}
            </p>
            <p>Índice = 4 x C x Q = {criticality?.criticalityIndex ?? "sem cálculo (dados insuficientes)"}</p>
            <p className="mt-1 text-graphite-400">Classe A também se aplica quando S &gt;= 4 ou P = 5, independente do índice.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div><p className="text-graphite-500">MTBF real</p><p className="font-medium text-navy-900">{criticality?.mtbfHours != null ? `${Math.round(criticality.mtbfHours)} h` : "sem dados"}</p></div>
            <div>
              <p className="text-graphite-500">MTBF-meta</p>
              <p className="font-medium text-navy-900">{mtbfTargetResolved != null ? `${Math.round(mtbfTargetResolved)} h` : "sem dados"}</p>
              <p className="text-[10px] text-graphite-400">{metaPropria ? "definida no ativo" : "média da família"}</p>
            </div>
            <div><p className="text-graphite-500">Falhas (12 meses)</p><p className="font-medium text-navy-900">{criticality?.failureCount12m ?? "sem dados"}</p></div>
            <div><p className="text-graphite-500">Horas operadas (12 meses)</p><p className="font-medium text-navy-900">{criticality?.operatingHours12m != null ? `${Math.round(criticality.operatingHours12m)} h` : "sem dados"}</p></div>
          </div>

          {(criticality?.safetyNotes || criticality?.productionNotes) && (
            <div className="mt-4 space-y-2 text-sm">
              {criticality.safetyNotes && <p><span className="font-medium text-navy-900">Segurança:</span> {criticality.safetyNotes}</p>}
              {criticality.productionNotes && <p><span className="font-medium text-navy-900">Produção:</span> {criticality.productionNotes}</p>}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-navy-900">Histórico de alterações</h2>
        </div>
        {!criticality?.logs || criticality.logs.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-graphite-400">Nenhum calculo registrado ainda.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {criticality.logs.map((log) => (
              <div key={log.id} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-graphite-300" />
                  <div>
                    <p className="font-medium text-navy-900">{TRIGGER_LABELS[log.trigger] ?? log.trigger}</p>
                    <p className="text-xs text-graphite-500">
                      S {log.safetyScore} / P {log.productionScore} / Q {log.failureScore ?? "-"} - Índice {log.criticalityIndex ?? "-"} - {log.origin === "MANUAL" ? "Manual" : "Automático"}
                      {log.responsible ? ` - ${log.responsible.name}` : ""}
                    </p>
                    {log.reason && <p className="text-xs text-graphite-400">{log.reason}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <CriticalityClassBadge criticalityClass={log.criticalityClass} size="sm" />
                  <span className="text-xs text-graphite-400">{formatDateTime(log.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Revisar avaliacao manual"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setReviewOpen(false)}>Cancelar</button>
            <button type="submit" form="criticality-review-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar revisao"}
            </button>
          </>
        }
      >
        <form id="criticality-review-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <details className="rounded-lg border border-gray-200 bg-gray-50/60 text-sm open:pb-2">
            <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 font-medium text-navy-800">
              <ChevronDown className="h-4 w-4" /> Tabela de referencia (S / P / Q)
            </summary>
            <div className="space-y-2 px-3 pb-1 text-xs text-graphite-600">
              <p><span className="font-semibold text-navy-800">Segurança/SSMA (S):</span> 1 sem lesão/impacto - 2 lesão leve - 3 afastamento/dano reversível/risco legal moderado - 4 lesão grave/impacto significativo/infração legal - 5 fatalidade/múltiplas vítimas/impacto grave.</p>
              <p><span className="font-semibold text-navy-800">Produção (P):</span> considere % de capacidade perdida, duração da parada, redundância/bypass, reserva disponível e tempo de recuperação. 1 sem parada ou redundância integral - 2 parada local curta - 3 redução de capacidade/parada parcial - 4 parada de linha/perda elevada - 5 parada total/gargalo principal.</p>
              <p><span className="font-semibold text-navy-800">Quebras (Q):</span> calculado pela razão MTBF real / MTBF-meta - não se preenche direto (veja o campo MTBF-meta abaixo).</p>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-3">
            <SelectInput label="Segurança / SSMA (S)" required options={NOTA_OPTIONS} error={errors.safetyScore?.message} {...register("safetyScore")} />
            <SelectInput label="Produção (P)" required options={NOTA_OPTIONS} error={errors.productionScore?.message} {...register("productionScore")} />
          </div>
          <TextareaInput label="Justificativa de Segurança" rows={2} {...register("safetyNotes")} />
          <TextareaInput label="Justificativa de Produção" rows={2} {...register("productionNotes")} />

          <TextInput
            label="MTBF-meta (h)"
            hint="Deixe em branco para não mexer. Digite 0 para limpar e voltar a usar a média dos ativos do mesmo tipo."
            {...register("mtbfTargetHours")}
          />

          <SelectInput
            label="Origem da nota de Falhas (Q)"
            options={[
              { value: "AUTO", label: "Automática (recalcula pela razão MTBF real/meta)" },
              { value: "MANUAL", label: "Manual (sobrescreve o cálculo automático)" },
            ]}
            {...register("failureScoreMode")}
          />
          {failureScoreMode === "MANUAL" && (
            <SelectInput label="Nota de Falhas (Q)" required options={NOTA_OPTIONS} error={errors.failureScore?.message} {...register("failureScore")} />
          )}
          <TextareaInput
            label="Motivo da revisao"
            required
            hint="Fica registrado no histórico com responsável e data."
            error={errors.reason?.message}
            rows={2}
            {...register("reason")}
          />
        </form>
      </Modal>
    </div>
  );
}
