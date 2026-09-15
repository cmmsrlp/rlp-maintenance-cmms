import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Droplets, ShoppingCart, CalendarRange, Gauge } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { StatCard } from "../../../components/StatCard";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { getLubricationForecast } from "../../../api/lubrication";
import { formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

function emIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Previsao de consumo de lubrificantes no periodo.
 *
 * A conta nao e' "periodo dividido pela frequencia": conta os vencimentos de verdade de
 * cada ponto dentro da janela. Um ponto que vence daqui a 25 dias nao consome nada num
 * periodo de 20 - e a divisao simples diria que consome. */
export default function LubricationForecast() {
  const { isClient, base } = useCmms();
  const [clientId, setClientId] = useState("");
  const hoje = new Date();
  const [dateFrom, setDateFrom] = useState(emIso(hoje));
  const [dateTo, setDateTo] = useState(emIso(new Date(hoje.getTime() + 90 * 24 * 60 * 60 * 1000)));
  const [verDetalhe, setVerDetalhe] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["lubrificacao-previsao", clientId, dateFrom, dateTo],
    queryFn: () => getLubricationForecast({ clientId: clientId || undefined, dateFrom, dateTo }),
  });

  return (
    <div>
      <PageHeader
        title="Previsão de consumo de lubrificantes"
        description="Quanto de cada lubrificante a rotina vai consumir no período, e o que falta comprar"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Lubrificação", to: `${base}/lubrificacao` },
          { label: "Previsão de consumo" },
        ]}
      />

      <div className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        {!isClient && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-graphite-700">Cliente</span>
            <ClientFilterSelect className="sm:w-64" value={clientId} onChange={setClientId} service="CMMS_MAINTENANCE" allLabel="Todos" />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-graphite-700">De</span>
          <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-graphite-700">Ate</span>
          <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            { rotulo: "30 dias", dias: 30 },
            { rotulo: "90 dias", dias: 90 },
            { rotulo: "6 meses", dias: 182 },
            { rotulo: "1 ano", dias: 365 },
          ].map((atalho) => (
            <button
              key={atalho.dias}
              type="button"
              className="btn-outline btn-sm"
              onClick={() => {
                const de = new Date();
                setDateFrom(emIso(de));
                setDateTo(emIso(new Date(de.getTime() + atalho.dias * 24 * 60 * 60 * 1000)));
              }}
            >
              {atalho.rotulo}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <EmptyState title="Não foi possível calcular a previsão" description={(error as Error)?.message ?? "Tente outro período."} />
      ) : isLoading || !data ? (
        <FullPageSpinner />
      ) : data.itens.length === 0 ? (
        <EmptyState
          title="Nenhum consumo previsto neste período"
          description={
            data.totais.pontosConsiderados === 0
              ? "Não há pontos de lubrificação cadastrados. Cadastre os pontos para a previsão aparecer."
              : "Os pontos cadastrados não têm aplicação prevista dentro da janela escolhida - experimente um período maior."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Lubrificantes" value={data.totais.lubrificantes} icon={Droplets} tone="navy" />
            <StatCard label="Aplicações previstas" value={data.totais.aplicacoesPrevistas} icon={CalendarRange} tone="navy" />
            <StatCard label="Pontos considerados" value={data.totais.pontosConsiderados} icon={Gauge} tone="navy" />
            <StatCard
              label="Itens a comprar"
              value={data.totais.itensAComprar}
              icon={ShoppingCart}
              tone={data.totais.itensAComprar > 0 ? "yellow" : "green"}
            />
          </div>

          <p className="mt-4 text-xs text-graphite-500">
            Período de {formatDate(data.periodo.de)} a {formatDate(data.periodo.ate)} ({data.periodo.dias} dias).
            "A comprar" já considera manter o estoque mínimo de cada item.
          </p>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                <tr>
                  <th className="px-4 py-2.5">Lubrificante</th>
                  <th className="px-4 py-2.5 text-right">Pontos</th>
                  <th className="px-4 py-2.5 text-right">Aplicações</th>
                  <th className="px-4 py-2.5 text-right">Consumo previsto</th>
                  <th className="px-4 py-2.5 text-right">Saldo atual</th>
                  <th className="px-4 py-2.5 text-right">Cobertura</th>
                  <th className="px-4 py-2.5 text-right">A comprar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.itens.map((item) => (
                  <tr key={item.lubricantId} className={item.aComprar > 0 ? "bg-yellow-50/40" : undefined}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-navy-900">{item.nome}</p>
                      <p className="text-xs text-graphite-400">
                        {[item.codigo, item.especificacao].filter(Boolean).join(" - ") || "sem especificação"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right text-graphite-700">{item.pontos}</td>
                    <td className="px-4 py-2.5 text-right text-graphite-700">{item.aplicacoes}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-navy-900">
                      {item.consumoPrevisto} {item.unidade}
                    </td>
                    <td className="px-4 py-2.5 text-right text-graphite-700">
                      {item.saldoAtual} {item.unidade}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {item.diasDeCobertura == null ? (
                        <span className="text-graphite-400">-</span>
                      ) : (
                        <span className={item.diasDeCobertura < data.periodo.dias ? "font-medium text-safety-red" : "text-graphite-700"}>
                          {item.diasDeCobertura} dias
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {item.aComprar > 0 ? (
                        <span className="font-semibold text-safety-yellow-dark">
                          {/* Rastreado por embalagem: "a comprar" em kg/L nao e' uma decisao
                              de compra direta (ninguem compra 2,3 kg avulso) - embalagem
                              fechada e'. */}
                          {item.embalagensACobrar != null
                            ? `${item.embalagensACobrar} embalagem(ns)`
                            : `${item.aComprar} ${item.unidade}`}
                        </span>
                      ) : (
                        <span className="text-safety-green-dark">ok</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setVerDetalhe((v) => !v)}>
              {verDetalhe ? "Ocultar" : "Ver"} o detalhe por ponto
            </button>
            {verDetalhe && (
              <div className="card mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                    <tr>
                      <th className="px-4 py-2.5">Ponto</th>
                      <th className="px-4 py-2.5">Ativo</th>
                      <th className="px-4 py-2.5">Lubrificante</th>
                      <th className="px-4 py-2.5 text-right">Aplicações</th>
                      <th className="px-4 py-2.5 text-right">Consumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.detalhePorPonto.map((d) => (
                      <tr key={d.pointId}>
                        <td className="px-4 py-2">
                          <p className="text-graphite-800">{d.code} - {d.name}</p>
                          {d.area && <p className="text-xs text-graphite-400">{d.area}</p>}
                        </td>
                        <td className="px-4 py-2 text-graphite-600">{d.instrumentTag ?? "-"}</td>
                        <td className="px-4 py-2 text-graphite-600">{d.lubricante}</td>
                        <td className="px-4 py-2 text-right text-graphite-700">{d.aplicacoes}</td>
                        <td className="px-4 py-2 text-right text-graphite-700">
                          {Number(d.consumoPrevisto.toFixed(3))} {d.unidade}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
