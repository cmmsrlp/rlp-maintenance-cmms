import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CalendarClock, Radar, Waves, Thermometer, Droplets, Volume2, Zap, Eye, Gauge } from "lucide-react";
import { getPredictivePanel } from "../../../api/meters";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import type { ConditionSeverity, PredictivePoint, PredictiveTechnique } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { Tabs } from "../../../components/Tabs";
import { AnaliseLaudosConteudo } from "../../portal/AnaliseLaudos";
import { formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

const TECHNIQUE: Record<PredictiveTechnique, { label: string; icon: typeof Waves }> = {
  COUNTER: { label: "Contador de uso", icon: Gauge },
  VIBRATION: { label: "Vibração", icon: Waves },
  THERMOGRAPHY: { label: "Termografia", icon: Thermometer },
  OIL_ANALYSIS: { label: "Análise de óleo", icon: Droplets },
  ULTRASOUND: { label: "Ultrassom", icon: Volume2 },
  MOTOR_CURRENT: { label: "Análise de corrente", icon: Zap },
  VISUAL: { label: "Inspeção sensitiva", icon: Eye },
  OTHER: { label: "Outra técnica", icon: Activity },
};

const SEVERITY: Record<ConditionSeverity, { label: string; chip: string; bar: string; action: string }> = {
  NORMAL: { label: "Normal", chip: "bg-green-50 text-safety-green-dark border-green-200", bar: "bg-safety-green", action: "Operação normal." },
  WARNING: {
    label: "Alerta",
    chip: "bg-amber-50 text-safety-yellow-dark border-amber-200",
    bar: "bg-safety-yellow",
    action: "Degradação iniciada - aumente a frequência de coleta e acompanhe a tendência. Não abre OS.",
  },
  ALARM: {
    label: "Alarme",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    bar: "bg-orange-500",
    action: "Programe a intervenção na próxima oportunidade. OS preditiva aberta como Programada.",
  },
  CRITICAL: {
    label: "Crítico",
    chip: "bg-red-50 text-safety-red border-red-200",
    bar: "bg-safety-red",
    action: "Aja imediatamente - risco de falha funcional. OS preditiva aberta com prioridade crítica.",
  },
};

/**
 * Painel da manutencao preditiva: mostra a condicao medida dos ativos por zona de
 * severidade e o que fazer em cada uma. A ideia e' ver a degradacao antes da falha -
 * por isso "Alerta" aparece aqui sem abrir OS, e pontos com coleta atrasada tambem sao
 * cobrados (ponto que parou de ser medido nao protege nada).
 */
export default function PredictivePanel() {
  const { isClient, base, assetsBase } = useCmms();
  const [clientId, setClientId] = useState("");
  const [aba, setAba] = useState<"pontos" | "laudos">("pontos");

  const { data, isLoading } = useQuery({
    queryKey: ["predictive-panel", clientId],
    queryFn: () => getPredictivePanel({ clientId: clientId || undefined }),
    enabled: aba === "pontos",
  });

  return (
    <div>
      <PageHeader
        title="Manutenção preditiva"
        description="Condição medida dos ativos por zona de severidade - agir antes da falha"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Preditiva" }]}
      />

      <Tabs
        tabs={[
          { id: "pontos", label: "Pontos monitorados" },
          { id: "laudos", label: "Análise de laudos" },
        ]}
        active={aba}
        onChange={(id) => setAba(id as "pontos" | "laudos")}
      />

      {aba === "laudos" ? (
        <AnaliseLaudosConteudo />
      ) : (
        <>
      {!isClient && (
        <div className="mb-4">
          <ClientFilterSelect
            className="sm:w-80"
            value={clientId}
            onChange={setClientId}
            service="CMMS_MAINTENANCE"
            allLabel="Todas as empresas"
          />
        </div>
      )}

      {isLoading || !data ? (
        <FullPageSpinner />
      ) : data.totals.points === 0 ? (
        <EmptyState
          icon={Radar}
          title="Nenhum ponto de medição preditiva"
          description="A preditiva mede condição (vibração, temperatura, óleo, ultrassom) em pontos do ativo. Cadastre os pontos na ficha do ativo, aba Medidores, escolhendo a técnica e os limites de alerta/alarme/crítico."
          action={
            <Link to={assetsBase} className="btn-primary">
              <Gauge className="h-4 w-4" /> Ir para os ativos
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Críticos" value={data.totals.critical} icon={AlertTriangle} tone={data.totals.critical > 0 ? "red" : "navy"} />
            <StatCard label="Em alarme" value={data.totals.alarm} icon={Activity} tone={data.totals.alarm > 0 ? "yellow" : "navy"} />
            <StatCard label="Em alerta" value={data.totals.warning} icon={Radar} tone="yellow" />
            <StatCard label="Coleta atrasada" value={data.totals.collectionOverdue + data.totals.neverMeasured} icon={CalendarClock} tone={data.totals.collectionOverdue > 0 ? "yellow" : "navy"} />
          </div>

          <h2 className="mb-3 mt-8 font-semibold text-navy-900">Exige atenção</h2>
          {data.needsAttention.length === 0 ? (
            <div className="card p-5 text-sm text-graphite-500">
              Todos os pontos medidos estão na zona normal. {data.totals.points} ponto(s) monitorado(s).
            </div>
          ) : (
            <div className="space-y-3">
              {data.needsAttention.map((p) => (
                <PointCard key={p.id} point={p} assetsBase={assetsBase} />
              ))}
            </div>
          )}

          {data.collectionOverdue.length > 0 && (
            <>
              <h2 className="mb-1 mt-8 font-semibold text-navy-900">Coleta atrasada</h2>
              <p className="mb-3 text-sm text-graphite-500">
                Sem medição na periodicidade definida não dá para afirmar a condição do ativo - estes pontos estão cegos.
              </p>
              <div className="card divide-y divide-gray-100">
                {data.collectionOverdue.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <Link to={`${assetsBase}/${p.instrument.id}`} className="text-sm font-medium text-navy-900 hover:underline">
                        {p.instrument.tag ?? p.instrument.type} - {p.name}
                      </Link>
                      <p className="text-xs text-graphite-400">
                        {TECHNIQUE[p.technique].label}
                        {p.frequencyDays ? ` - a cada ${p.frequencyDays} dias` : ""}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-safety-yellow-dark">
                      {p.neverMeasured
                        ? "Nunca medido"
                        : `Atrasado há ${Math.abs(p.dueInDays ?? 0)} dia(s) - última em ${formatDate(p.lastReadingAt)}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="mb-3 mt-8 font-semibold text-navy-900">Todos os pontos monitorados</h2>
          <div className="space-y-3">
            {data.points.map((p) => (
              <PointCard key={p.id} point={p} assetsBase={assetsBase} compact />
            ))}
          </div>
        </>
      )}
        </>
      )}
    </div>
  );
}

function PointCard({ point, assetsBase, compact }: { point: PredictivePoint; assetsBase: string; compact?: boolean }) {
  const severity = point.severity ?? "NORMAL";
  const style = SEVERITY[severity];
  const Icon = TECHNIQUE[point.technique].icon;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-navy-600" />
            <Link to={`${assetsBase}/${point.instrument.id}`} className="font-medium text-navy-900 hover:underline">
              {point.instrument.tag ?? point.instrument.type}
            </Link>
            <span className="text-sm text-graphite-500">- {point.name}</span>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${style.chip}`}>{style.label}</span>
          </div>
          <p className="mt-0.5 text-xs text-graphite-400">
            {TECHNIQUE[point.technique].label}
            {point.criterion ? ` - critério ${point.criterion}` : ""}
            {point.instrument.description ? ` - ${point.instrument.description}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-navy-900">
            {point.lastValue != null ? `${point.lastValue} ${point.unit}` : "Sem leitura"}
          </p>
          <p className="text-xs text-graphite-400">
            {point.lastReadingAt ? `medido em ${formatDate(point.lastReadingAt)}` : "nunca medido"}
          </p>
        </div>
      </div>

      {point.trend.length > 1 && <Trend point={point} />}

      {!compact && severity !== "NORMAL" && (
        <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-graphite-600">{style.action}</p>
      )}
    </div>
  );
}

/** Tendencia simples em barras: o valor importa menos que a inclinacao - e' a subida que
 * antecipa a falha. Cada barra usa a cor da zona em que aquela leitura caiu. */
function Trend({ point }: { point: PredictivePoint }) {
  const values = point.trend.map((t) => t.value);
  const max = Math.max(...values, point.limits.critical ?? 0, point.limits.alarm ?? 0) || 1;

  return (
    <div className="mt-3">
      <div className="flex h-12 items-end gap-1">
        {point.trend.map((t, i) => (
          <div
            key={i}
            title={`${t.value} ${point.unit} em ${formatDate(t.readAt)} (${SEVERITY[t.severity].label})`}
            className={`flex-1 rounded-t ${SEVERITY[t.severity].bar}`}
            style={{ height: `${Math.max(6, (t.value / max) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-graphite-400">
        <span>{formatDate(point.trend[0]?.readAt)}</span>
        <span>
          {point.limits.warning != null && `alerta ${point.limits.warning}`}
          {point.limits.alarm != null && ` · alarme ${point.limits.alarm}`}
          {point.limits.critical != null && ` · crítico ${point.limits.critical}`}
          {point.limits.warning == null && point.limits.alarm == null && point.limits.critical == null && "sem limites definidos"}
        </span>
        <span>{formatDate(point.trend[point.trend.length - 1]?.readAt)}</span>
      </div>
    </div>
  );
}
