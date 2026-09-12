import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Gauge, Activity, TimerReset, Download } from "lucide-react";
import { getMaintenanceDashboard, getMaintenanceBacklog } from "../../../api/maintenanceWorkOrders";
import type { BacklogGroupBy } from "../../../api/types";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { getClient, getOwnClient } from "../../../api/clients";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";

import { StatCard, MiniStat } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { formatKpi } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { buildCsv, downloadCsv } from "../../../lib/csvExport";

/** Como o backlog aparece na tela para cada agrupamento. */
const ROTULO_AGRUPAMENTO: Record<BacklogGroupBy, string> = {
  plant: "Planta",
  area: "Area",
  instrument: "Ativo",
  costCenter: "Centro de custo",
};

export default function MaintenanceDashboard() {
  const [agrupamento, setAgrupamento] = useState<BacklogGroupBy>("plant");
  const { isClient } = useCmms();
  const [clientId, setClientId] = useState("");

  // Marca do topo do painel: a da propria empresa, quando ela tem uma cadastrada - o logo
  // pequeno da barra lateral do portal continua sendo sempre o do produto, so este aqui
  // (o grande, de boas-vindas) e' que vira a marca do cliente.
  const { data: ownClient } = useQuery({
    queryKey: ["own-client"],
    queryFn: getOwnClient,
    enabled: isClient,
    staleTime: 300_000,
  });
  const { data: clienteSelecionado } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
    enabled: !isClient && !!clientId,
  });
  const logoDoCliente = isClient ? ownClient?.logoUrl : clienteSelecionado?.logoUrl;
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-dashboard", clientId],
    queryFn: () => getMaintenanceDashboard({ clientId: clientId || undefined }),
  });

  const { data: backlog } = useQuery({
    queryKey: ["manutencao-backlog", clientId, agrupamento],
    queryFn: () => getMaintenanceBacklog({ clientId: clientId || undefined, groupBy: agrupamento }),
  });

  function exportarIndicadoresCsv() {
    if (!data) return;
    const kpiRows = [
      { indicador: "MTTR (horas)", valor: formatKpi(data.kpis.mttrHours) },
      { indicador: "MTBF (horas)", valor: formatKpi(data.kpis.mtbfHours) },
      { indicador: "Disponibilidade (%)", valor: formatKpi(data.kpis.availabilityPct) },
      { indicador: "Cumprimento do plano (%)", valor: formatKpi(data.kpis.planComplianceRatePct) },
      { indicador: "Ordens abertas", valor: data.totals.open },
      { indicador: "Em andamento", valor: data.totals.inProgress },
      { indicador: "Concluidas (periodo)", valor: data.totals.completed },
      { indicador: "Preventivas (periodo)", valor: data.totals.preventive },
      { indicador: "Corretivas (periodo)", valor: data.totals.corrective },
      { indicador: "Preditivas (periodo)", valor: data.totals.predictive },
      { indicador: "Backlog (horas)", valor: data.pcm.backlogHours },
      { indicador: "Atrasadas", valor: data.pcm.overdue },
      { indicador: "Emergenciais em aberto", valor: data.pcm.emergency },
    ];
    const kpiCsv = buildCsv(kpiRows, [
      { label: "Indicador", value: (r) => r.indicador },
      { label: "Valor", value: (r) => r.valor },
    ]);

    const backlogRows = backlog?.itens ?? [];
    const backlogCsv =
      backlogRows.length > 0
        ? buildCsv(backlogRows, [
            { label: ROTULO_AGRUPAMENTO[agrupamento], value: (i) => i.nome },
            { label: "Backlog (h)", value: (i) => i.horas },
            { label: "OS abertas", value: (i) => i.ordens },
            { label: "Sem HH", value: (i) => i.semEstimativa },
            { label: "Atrasadas", value: (i) => i.atrasadas },
            { label: "Emergenciais", value: (i) => i.emergenciais },
            { label: "Corretivas", value: (i) => i.corretivas },
            { label: "Preventivas", value: (i) => i.preventivas },
          ])
        : "";

    const csv = backlogCsv ? `${kpiCsv}\r\n\r\nBacklog por ${ROTULO_AGRUPAMENTO[agrupamento].toLowerCase()}\r\n${backlogCsv}` : kpiCsv;
    downloadCsv(`indicadores-manutencao-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div>
      <PageHeader
        title="Manutencao"
        description="Ciclo completo de manutencao - planos preventivos, ordens, pecas e indicadores (ultimos 90 dias)"
        actions={
          <>
            {data && (
              <button className="btn-outline" onClick={exportarIndicadoresCsv}>
                <Download className="h-4 w-4" /> Exportar CSV
              </button>
            )}
            {logoDoCliente && (
              <img src={logoDoCliente} alt="Logo da empresa" className="h-10 w-auto max-w-[9rem] object-contain" />
            )}
          </>
        }
      />

      {!isClient && (
        <div className="mb-4">
          <ClientFilterSelect className="sm:w-72" value={clientId} onChange={setClientId} service="CMMS_MAINTENANCE" />
        </div>
      )}

      {isLoading || !data ? (
        <FullPageSpinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="MTTR (horas)" value={formatKpi(data.kpis.mttrHours)} icon={TimerReset} tone="navy" />
            <StatCard label="MTBF (horas)" value={formatKpi(data.kpis.mtbfHours)} icon={Activity} tone="navy" />
            <StatCard label="Disponibilidade" value={formatKpi(data.kpis.availabilityPct, "%")} icon={Gauge} tone="green" />
            <StatCard label="Cumprimento do plano" value={formatKpi(data.kpis.planComplianceRatePct, "%")} icon={Wrench} tone="yellow" />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MiniStat label="Ordens abertas" value={data.totals.open} />
            <MiniStat label="Em andamento" value={data.totals.inProgress} />
            <MiniStat label="Concluidas (periodo)" value={data.totals.completed} />
            <MiniStat label="Preventivas (periodo)" value={data.totals.preventive} />
            <MiniStat label="Corretivas (periodo)" value={data.totals.corrective} />
            <MiniStat
              label="Preditivas (periodo)"
              value={data.totals.predictive}
              hint={data.totals.predictive > 0 ? `${data.totals.predictiveAutoOpened} abertas sozinhas por medidor` : undefined}
            />
            <MiniStat label="Total de OS (periodo)" value={data.totals.workOrders} />
            <MiniStat label="Canceladas (periodo)" value={data.totals.canceled} />
          </div>

          <h2 className="mb-3 mt-8 font-semibold text-navy-900">PCM - planejamento e controle</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat
              label="Backlog"
              value={`${data.pcm.backlogHours}h`}
              hint={data.pcm.openWithoutEstimate > 0 ? `${data.pcm.openWithoutEstimate} OS em aberto sem HH prevista (fora da conta)` : undefined}
            />
            <MiniStat label="Atrasadas" value={data.pcm.overdue} tone={data.pcm.overdue > 0 ? "red" : "default"} />
            <MiniStat label="Emergenciais (criticas, em aberto)" value={data.pcm.emergency} tone={data.pcm.emergency > 0 ? "red" : "default"} />
            <MiniStat
              label="Aderencia a programacao"
              value={data.pcm.scheduleAdherencePct != null ? `${data.pcm.scheduleAdherencePct}%` : "Dados insuficientes"}
              hint={data.pcm.scheduleAdherencePct != null ? `${data.pcm.scheduledCompletedCount} OS programadas concluidas no periodo` : undefined}
            />
            <MiniStat label="Aguardando material" value={data.pcm.awaitingMaterial} />
            <MiniStat label="Aguardando liberacao" value={data.pcm.awaitingRelease} />
            <MiniStat label="Aguardando parada" value={data.pcm.awaitingStoppage} />
            <MiniStat label="HH prevista x realizada (concluidas)" value={`${data.pcm.plannedHoursCompleted}h / ${data.pcm.actualHoursCompleted}h`} />
          </div>

          {/* Backlog aberto: o total sozinho nao diz onde esta a fila. Aqui da pra ver que
              a HH pendente esta concentrada numa area (ou num ativo) so. */}
          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-navy-900">Backlog por {ROTULO_AGRUPAMENTO[agrupamento].toLowerCase()}</h2>
                <p className="text-xs text-graphite-500">HH pendente das OS em aberto, do maior para o menor.</p>
              </div>
              <select
                className="input w-auto"
                value={agrupamento}
                onChange={(e) => setAgrupamento(e.target.value as BacklogGroupBy)}
              >
                <option value="plant">Geral da planta</option>
                <option value="area">Por area</option>
                <option value="instrument">Por ativo</option>
                <option value="costCenter">Por centro de custo</option>
              </select>
            </div>

            {!backlog || backlog.itens.length === 0 ? (
              <EmptyState title="Nenhuma OS em aberto" description="Sem fila pendente, nao ha backlog a distribuir." />
            ) : (
              <>
                {backlog.totais.coberturaPct != null && backlog.totais.coberturaPct < 100 && (
                  <p className="mb-2 text-xs text-safety-yellow-dark">
                    {backlog.totais.semEstimativa} das {backlog.totais.ordens} OS em aberto estao sem HH prevista
                    ({backlog.totais.coberturaPct}% da fila entra na conta de horas) - o backlog real e' maior que o numero abaixo.
                  </p>
                )}
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                      <tr>
                        <th className="px-4 py-2.5">{ROTULO_AGRUPAMENTO[agrupamento]}</th>
                        <th className="px-4 py-2.5 text-right">Backlog (h)</th>
                        <th className="px-4 py-2.5 text-right">OS abertas</th>
                        <th className="px-4 py-2.5 text-right">Sem HH</th>
                        <th className="px-4 py-2.5 text-right">Atrasadas</th>
                        <th className="px-4 py-2.5 text-right">Emergenciais</th>
                        <th className="px-4 py-2.5">Corretiva / Preventiva</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {backlog.itens.map((i) => {
                        const maior = backlog.itens[0].horas || 1;
                        return (
                          <tr key={i.id}>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-navy-900">{i.nome}</p>
                              <div className="mt-1 h-1.5 w-32 rounded-full bg-gray-100">
                                <div className="h-1.5 rounded-full bg-navy-600" style={{ width: `${Math.max(3, (i.horas / maior) * 100)}%` }} />
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-navy-900">{i.horas}h</td>
                            <td className="px-4 py-2.5 text-right text-graphite-700">{i.ordens}</td>
                            <td className="px-4 py-2.5 text-right">
                              {i.semEstimativa > 0 ? <span className="text-safety-yellow-dark">{i.semEstimativa}</span> : <span className="text-graphite-400">-</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {i.atrasadas > 0 ? <span className="font-medium text-safety-red">{i.atrasadas}</span> : <span className="text-graphite-400">-</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {i.emergenciais > 0 ? <span className="font-medium text-safety-red">{i.emergenciais}</span> : <span className="text-graphite-400">-</span>}
                            </td>
                            <td className="px-4 py-2.5 text-graphite-600">{i.corretivas} / {i.preventivas}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
