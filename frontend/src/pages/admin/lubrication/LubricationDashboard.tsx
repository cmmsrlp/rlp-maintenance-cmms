import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Droplets, AlertTriangle, CalendarClock, Route, CheckCircle2, CircleAlert } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { getLubricationDashboard } from "../../../api/lubrication";
import { formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

/** Painel da lubrificacao: o que esta vencido, o que vence na semana e por onde comecar.
 * O lubrificador abre esta tela e ja sabe o dia dele. */
export default function LubricationDashboard() {
  const { isClient, base } = useCmms();
  const [clientId, setClientId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lubrificacao-dashboard", clientId],
    queryFn: () => getLubricationDashboard({ clientId: clientId || undefined }),
  });

  return (
    <div>
      <PageHeader
        title="Lubrificação"
        description="Do lubrificante no almoxarifado até a aplicação no ponto"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Lubrificação" }]}
        actions={
          <>
            <Link to={`${base}/lubrificacao/pontos`} className="btn-outline">Pontos</Link>
            <Link to={`${base}/lubrificacao/previsao`} className="btn-primary">Previsao de consumo</Link>
          </>
        }
      />

      {!isClient && (
        <div className="mb-6">
          <ClientFilterSelect className="sm:w-72" value={clientId} onChange={setClientId} service="CMMS_MAINTENANCE" />
        </div>
      )}

      {isLoading || !data ? (
        <FullPageSpinner />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Pontos cadastrados" value={data.totais.pontos} icon={Droplets} tone="navy" />
            <StatCard label="Vencidos" value={data.totais.vencidos} icon={AlertTriangle} tone="red" />
            <StatCard label="Vencem em 7 dias" value={data.totais.proximos7Dias} icon={CalendarClock} tone="yellow" />
            <StatCard label="Rotas ativas" value={data.totais.rotas} icon={Route} tone="navy" />
            {/* Ativo marcado como lubrificavel e sem ponto nao entra em rota nenhuma: a
                falta dele nao aparece em vencido nem em atrasado. So aqui. */}
            {data.totais.pendentesDeCadastro > 0 && (
              <Link to={`${base}/lubrificacao/pontos`}>
                <StatCard
                  label="Ativos esperando ponto"
                  value={data.totais.pendentesDeCadastro}
                  icon={CircleAlert}
                  tone="yellow"
                />
              </Link>
            )}
            <StatCard
              label="Aderencia"
              /* Sem ponto cadastrado nao ha aderencia a mostrar - "100%" ali seria mentira. */
              value={data.aderenciaPct != null ? `${data.aderenciaPct}%` : "-"}
              icon={CheckCircle2}
              tone={data.aderenciaPct != null && data.aderenciaPct >= 90 ? "green" : "yellow"}
            />
          </div>

          <div className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-navy-900">Pontos vencidos</h2>
              <p className="text-xs text-graphite-500">Do mais atrasado para o mais recente - a ordem de atendimento.</p>
            </div>

            {data.atrasados.length === 0 ? (
              <EmptyState
                title={data.totais.pontos === 0 ? "Nenhum ponto cadastrado ainda" : "Nenhum ponto vencido"}
                description={
                  data.totais.pontos === 0
                    ? "Comece cadastrando os lubrificantes (a partir das peças do almoxarifado) e depois os pontos de cada equipamento."
                    : "Toda a lubrificação está em dia."
                }
              />
            ) : (
              <div className="card divide-y divide-gray-100">
                {data.atrasados.map((p) => {
                  const diasAtraso = p.nextDueAt
                    ? Math.floor((Date.now() - new Date(p.nextDueAt).getTime()) / (24 * 60 * 60 * 1000))
                    : null;
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <Link to={`${base}/lubrificacao/pontos/${p.id}`} className="font-medium text-navy-800 hover:underline">
                          {p.code} - {p.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-graphite-500">
                          {p.instrument?.tag ?? "sem TAG"}
                          {p.instrument?.area ? ` - ${p.instrument.area.name}` : ""}
                          {" - "}
                          {p.quantityPerApplication} {p.lubricant?.sparePart.unit ?? ""} de {p.lubricant?.sparePart.name ?? "-"}
                          {" a cada "}
                          {p.frequencyDays} dias
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-safety-red">
                          {diasAtraso != null && diasAtraso > 0 ? `${diasAtraso} dia(s) de atraso` : "Vence hoje"}
                        </p>
                        <p className="text-xs text-graphite-400">
                          {p.lastLubricatedAt ? `Ultima: ${formatDate(p.lastLubricatedAt)}` : "Nunca lubrificado"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
