import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench, Gauge, Activity, TimerReset, Download, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { getMaintenanceDashboard, getMaintenanceBacklog } from "../../../api/maintenanceWorkOrders";
import type { BacklogGroupBy } from "../../../api/types";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeader } from "../../../components/PageHeader";
import { getClient, getOwnClient } from "../../../api/clients";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";

import { MiniStat } from "../../../components/StatCard";
import { RadialGauge } from "../../../components/RadialGauge";
import { FullPageSpinner } from "../../../components/Spinner";
import { formatKpi, formatCurrency } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { buildCsv, downloadCsv } from "../../../lib/csvExport";

/** Card de indicador do topo do painel - numero grande com icone, e um anel de progresso
 * (RadialGauge) por cima para os que sao percentual (disponibilidade, cumprimento do
 * plano). MTTR/MTBF nao tem uma escala de 0-100% natural, entao ficam so com o icone. */
function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
  gaugePct,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  accent: { bg: string; text: string; ring: string };
  gaugePct?: number | null;
}) {
  return (
    <div className="card flex items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className={`mb-3 inline-flex rounded-xl p-2.5 ${accent.bg} ${accent.text}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="text-2xl font-extrabold tracking-tight text-navy-900">{value}</p>
        <p className="mt-0.5 text-sm text-graphite-500">{label}</p>
      </div>
      {gaugePct !== undefined && (
        <div className="relative shrink-0">
          <RadialGauge value={gaugePct} color={accent.ring} size={56} />
          {gaugePct != null && (
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-navy-900">
              {Math.round(gaugePct)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const COR_TIPO_OS = {
  preventive: "#0F9D58",
  corrective: "#F5B400",
  predictive: "#335684",
  canceled: "#cbcfd5",
} as const;

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
            <KpiCard
              label="MTTR (horas)"
              value={formatKpi(data.kpis.mttrHours)}
              icon={TimerReset}
              accent={{ bg: "bg-navy-50", text: "text-navy-700", ring: "#335684" }}
            />
            <KpiCard
              label="MTBF (horas)"
              value={formatKpi(data.kpis.mtbfHours)}
              icon={Activity}
              accent={{ bg: "bg-navy-50", text: "text-navy-700", ring: "#335684" }}
            />
            <KpiCard
              label="Disponibilidade"
              value={formatKpi(data.kpis.availabilityPct, "%")}
              icon={Gauge}
              accent={{ bg: "bg-green-50", text: "text-safety-green-dark", ring: "#0F9D58" }}
              gaugePct={data.kpis.availabilityPct}
            />
            <KpiCard
              label="Cumprimento do plano"
              value={formatKpi(data.kpis.planComplianceRatePct, "%")}
              icon={Wrench}
              accent={{ bg: "bg-amber-50", text: "text-safety-yellow-dark", ring: "#F5B400" }}
              gaugePct={data.kpis.planComplianceRatePct}
            />
          </div>

          {/* Antes eram 8 caixinhas iguais competindo por atencao - separado agora em duas
              ideias: "de que tipo sao as OS do periodo" (a composicao, que se ve melhor num
              grafico) e "onde elas estao agora" (aberta/andamento/concluida, que e' fluxo,
              nao composicao - fica melhor como contagem simples). */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="card p-5">
              <p className="text-sm font-semibold text-navy-900">Composicao das OS</p>
              <div className="mt-3 flex items-center gap-4">
                <div className="relative shrink-0">
                  <PieChart width={92} height={92}>
                    <Pie
                      data={[
                        { name: "Preventiva", value: data.totals.preventive, color: COR_TIPO_OS.preventive },
                        { name: "Corretiva", value: data.totals.corrective, color: COR_TIPO_OS.corrective },
                        { name: "Preditiva", value: data.totals.predictive, color: COR_TIPO_OS.predictive },
                        { name: "Cancelada", value: data.totals.canceled, color: COR_TIPO_OS.canceled },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={28}
                      outerRadius={44}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {[COR_TIPO_OS.preventive, COR_TIPO_OS.corrective, COR_TIPO_OS.predictive, COR_TIPO_OS.canceled].map((cor) => (
                        <Cell key={cor} fill={cor} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`${v} OS`, n]} />
                  </PieChart>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-base font-extrabold text-navy-900">{data.totals.workOrders}</span>
                    <span className="text-[9px] uppercase tracking-wide text-graphite-400">total</span>
                  </div>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-graphite-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_TIPO_OS.preventive }} />
                      Preventiva
                    </span>
                    <span className="font-semibold text-navy-900">{data.totals.preventive}</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-graphite-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_TIPO_OS.corrective }} />
                      Corretiva
                    </span>
                    <span className="font-semibold text-navy-900">{data.totals.corrective}</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-graphite-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_TIPO_OS.predictive }} />
                      Preditiva
                    </span>
                    <span className="font-semibold text-navy-900">{data.totals.predictive}</span>
                  </li>
                  <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-graphite-600">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_TIPO_OS.canceled }} />
                      Cancelada
                    </span>
                    <span className="font-semibold text-navy-900">{data.totals.canceled}</span>
                  </li>
                </ul>
              </div>
              {data.totals.predictiveAutoOpened > 0 && (
                <p className="mt-2 text-[11px] text-graphite-400">{data.totals.predictiveAutoOpened} preditiva(s) aberta(s) sozinha(s) por medidor.</p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-900">Custos no periodo</p>
                <span className="flex items-center gap-1 rounded-lg bg-navy-50 px-2 py-1 text-xs font-bold text-navy-700">
                  <Wallet className="h-3.5 w-3.5" /> {formatCurrency(data.costs.total)}
                </span>
              </div>
              <div className="mt-2 h-[132px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={[
                      { tipo: "Preventiva", valor: data.costs.preventive, cor: COR_TIPO_OS.preventive },
                      { tipo: "Corretiva", valor: data.costs.corrective, cor: COR_TIPO_OS.corrective },
                      { tipo: "Preditiva", valor: data.costs.predictive, cor: COR_TIPO_OS.predictive },
                    ]}
                    margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
                  >
                    <CartesianGrid horizontal={false} stroke="#e5e7ea" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="tipo" width={70} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#5f6674" }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: "#f4f5f6" }} />
                    <Bar dataKey="valor" radius={[0, 6, 6, 0]} barSize={18} isAnimationActive={false}>
                      {["Preventiva", "Corretiva", "Preditiva"].map((tipo, i) => (
                        <Cell key={tipo} fill={[COR_TIPO_OS.preventive, COR_TIPO_OS.corrective, COR_TIPO_OS.predictive][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <MiniStat label="Ordens abertas" value={data.totals.open} />
              <MiniStat label="Em andamento" value={data.totals.inProgress} />
              <MiniStat label="Concluidas (periodo)" value={data.totals.completed} />
            </div>
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
