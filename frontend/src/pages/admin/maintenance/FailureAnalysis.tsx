import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getFailureAnalysis, listFailureRecords } from "../../../api/maintenanceWorkOrders";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import type { FailureAnalysisBucket, FailureSeverity } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { formatCurrency, formatDateTime } from "../../../lib/format";
import { Link } from "react-router-dom";
import { useCmms } from "../../../lib/cmms";
import { AlertTriangle, Siren, HelpCircle, Repeat } from "lucide-react";

/** Pareto de falhas: as OS corretivas do periodo agrupadas por codigo de falha, ativo
 * (ranking de mais problematicos) e area - pra responder "o que mais pesa" de tres
 * angulos. Barras simples em CSS, sem biblioteca de grafico so pra isso. */
export default function FailureAnalysis() {
  const { isClient, base } = useCmms();
  const [clientId, setClientId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["failure-analysis", clientId],
    queryFn: () => getFailureAnalysis({ clientId: clientId || undefined }),
  });

  // Os registros que os tecnicos preencheram nas OS corretivas. O Pareto acima diz "o que
  // mais pesa"; esta lista diz "o que aconteceu, uma falha por vez".
  const { data: registros } = useQuery({
    queryKey: ["registros-de-falha", clientId],
    queryFn: () => listFailureRecords({ clientId: clientId || undefined, pageSize: 25 }),
  });

  return (
    <div>
      <PageHeader
        title="Falhas e RCA"
        description="O que quebrou, quanto parou e o que ja foi investigado - a partir das OS corretivas"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Falhas e RCA" }]}
        actions={
          <Link to={`${base}/manutencao/rca`} className="btn-outline">
            Todas as analises (RCA)
          </Link>
        }
      />

      {!isClient && (
        <div className="mb-6">
          <ClientFilterSelect className="sm:w-72" value={clientId} onChange={setClientId} service="CMMS_MAINTENANCE" />
        </div>
      )}

      {isLoading || !data ? (
        <FullPageSpinner />
      ) : data.totalCorrective === 0 ? (
        <EmptyState title="Nenhuma OS corretiva no periodo" description="O Pareto aparece assim que houver ordens corretivas concluidas ou em andamento nos ultimos 90 dias." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="OS corretivas (periodo)" value={data.totalCorrective} icon={AlertTriangle} tone="navy" />
            <StatCard label="Emergenciais (criticas)" value={data.emergency} icon={Siren} tone="red" />
            <StatCard label="Sem codigo de falha" value={data.withoutFailureCode} icon={HelpCircle} tone="yellow" />
            <StatCard label="Codigos recorrentes" value={data.recurringFailureCodes} icon={Repeat} tone="yellow" />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <ParetoSection title="Por codigo de falha" buckets={data.byFailureCode} />
            <ParetoSection title="Por ativo (ranking)" buckets={data.byInstrument} />
            <ParetoSection title="Por area" buckets={data.byArea} />
          </div>
        </>
      )}

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-navy-900">Registros de falha</h2>
          <p className="text-xs text-graphite-500">Preenchidos pelo tecnico na OS corretiva.</p>
        </div>

        {!registros || registros.items.length === 0 ? (
          <EmptyState
            title="Nenhum registro de falha ainda"
            description="Numa OS corretiva, a aba Execucao tem o bloco 'Registro da falha' - o que for preenchido la aparece aqui."
          />
        ) : (
          <div className="card divide-y divide-gray-100">
            {registros.items.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`${base}/ordens/${r.id}`} className="font-medium text-navy-800 hover:underline">
                      {r.number}
                    </Link>
                    <span className="text-sm text-graphite-700">{r.title ?? r.description}</span>
                    {r.failureSeverity && (
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SEVERIDADE[r.failureSeverity].tom}`}>
                        {SEVERIDADE[r.failureSeverity].rotulo}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-graphite-500">
                    {r.instrument?.tag ?? "sem TAG"}
                    {r.instrument?.area ? ` - ${r.instrument.area.name}` : ""}
                    {r.failureStartedAt ? ` - ${formatDateTime(r.failureStartedAt)}` : ""}
                    {r.failureCode ? ` - ${r.failureCode.code}` : ""}
                  </p>
                  {r.failureRootCause && (
                    <p className="mt-1 text-sm text-graphite-600">Causa apurada: {r.failureRootCause}</p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  {/* Sem as duas datas nao da pra dizer quanto parou - e' melhor dizer isso
                      do que estampar "0h" como se a linha nao tivesse parado. */}
                  <p className="text-sm font-semibold text-navy-900">
                    {r.downtimeHours != null ? `${r.downtimeHours.toFixed(1)}h parada` : "Parada nao informada"}
                  </p>
                  {r.productionLoss != null && (
                    <p className="text-xs text-graphite-500">Perda: {r.productionLoss}</p>
                  )}
                  {r.rootCauseAnalyses && r.rootCauseAnalyses.length > 0 ? (
                    <Link to={`${base}/manutencao/rca/${r.rootCauseAnalyses[0].id}`} className="text-xs font-medium text-navy-700 hover:underline">
                      Ver RCA
                    </Link>
                  ) : (
                    <Link to={`${base}/manutencao/rca/novo?workOrderId=${r.id}`} className="text-xs font-medium text-navy-700 hover:underline">
                      Abrir RCA
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const SEVERIDADE: Record<FailureSeverity, { rotulo: string; tom: string }> = {
  LOW: { rotulo: "Baixa", tom: "border-gray-200 bg-gray-50 text-graphite-600" },
  MODERATE: { rotulo: "Moderada", tom: "border-yellow-200 bg-yellow-50 text-safety-yellow-dark" },
  HIGH: { rotulo: "Alta", tom: "border-orange-200 bg-orange-50 text-orange-700" },
  CRITICAL: { rotulo: "Critica", tom: "border-red-200 bg-red-50 text-safety-red" },
};

function ParetoSection({ title, buckets }: { title: string; buckets: FailureAnalysisBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="card p-5">
      <h2 className="mb-4 font-semibold text-navy-900">{title}</h2>
      {buckets.length === 0 ? (
        <p className="text-sm text-graphite-500">Sem dados suficientes.</p>
      ) : (
        <ul className="space-y-3">
          {buckets.slice(0, 10).map((b) => (
            <li key={b.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="line-clamp-1 font-medium text-graphite-800">{b.label}</span>
                <span className="shrink-0 text-graphite-500">
                  {b.count}x{b.downtimeHours > 0 && ` · ${b.downtimeHours}h parado`}{b.cost > 0 && ` · ${formatCurrency(b.cost)}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full bg-navy-600" style={{ width: `${(b.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
