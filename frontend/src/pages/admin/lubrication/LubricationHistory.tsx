import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { listLubricationRecords, listLubricants } from "../../../api/lubrication";
import type { LubricationRecord } from "../../../api/types";
import { formatDateTime } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { CONDICOES_DO_PONTO } from "../../../lib/lubricationLabels";

/** Historico de aplicacoes: o que de fato saiu do almoxarifado e entrou no equipamento.
 * E' o contraponto da previsao - previsto de um lado, realizado do outro. */
export default function LubricationHistory() {
  const { isClient, base } = useCmms();
  const [clientId, setClientId] = useState("");
  const [lubricantId, setLubricantId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const { data: lubricants } = useQuery({
    queryKey: ["lubrificantes", clientId],
    queryFn: () => listLubricants({ clientId: clientId || undefined }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["registros-lubrificacao", clientId, lubricantId, dateFrom, dateTo, page],
    queryFn: () =>
      listLubricationRecords({
        clientId: clientId || undefined,
        lubricantId: lubricantId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        pageSize: 25,
      }),
  });

  const totalAplicado = (data?.items ?? []).reduce<Record<string, { qtd: number; unidade: string }>>((acc, r) => {
    const nome = r.lubricant?.sparePart.name ?? "?";
    const atual = acc[nome] ?? { qtd: 0, unidade: r.lubricant?.sparePart.unit ?? "" };
    atual.qtd += r.quantity;
    acc[nome] = atual;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Histórico de lubrificação"
        description="O que foi aplicado, por quem e em que condição o ponto estava"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Lubrificação", to: `${base}/lubrificacao` },
          { label: "Histórico" },
        ]}
      />

      <div className="card mb-6 flex flex-wrap items-end gap-4 p-4">
        {!isClient && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-graphite-700">Cliente</span>
            <ClientFilterSelect
              className="sm:w-56"
              value={clientId}
              onChange={(id) => { setClientId(id); setPage(1); }}
              service="CMMS_MAINTENANCE"
              allLabel="Todos"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-graphite-700">Lubrificante</span>
          <select className="input sm:w-56" value={lubricantId} onChange={(e) => { setLubricantId(e.target.value); setPage(1); }}>
            <option value="">Todos</option>
            {(lubricants ?? []).map((l) => (
              <option key={l.id} value={l.id}>{l.sparePart.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-graphite-700">De</span>
          <input type="date" className="input" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-graphite-700">Ate</span>
          <input type="date" className="input" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
        </label>
      </div>

      {Object.keys(totalAplicado).length > 0 && (
        <p className="mb-3 text-xs text-graphite-500">
          Nesta página:{" "}
          {Object.entries(totalAplicado)
            .map(([nome, v]) => `${Number(v.qtd.toFixed(3))} ${v.unidade} de ${nome}`)
            .join("; ")}
        </p>
      )}

      {!isLoading && (data?.items ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma aplicação registrada"
          description="Assim que um ponto for lubrificado (em Lubrificação > Pontos, botão Registrar), a aplicação aparece aqui."
        />
      ) : (
        <DataTable<LubricationRecord>
          rows={data?.items ?? []}
          loading={isLoading}
          keyField={(r) => r.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhuma aplicação registrada"
          columns={[
            { header: "Quando", accessor: (r) => formatDateTime(r.executedAt) },
            {
              header: "Ponto",
              accessor: (r) => (
                <div>
                  <p className="text-graphite-800">{r.point?.code} - {r.point?.name}</p>
                  <p className="text-xs text-graphite-400">{r.point?.instrument?.tag ?? "sem TAG"}</p>
                </div>
              ),
            },
            {
              header: "Aplicado",
              accessor: (r) => (
                <span className="font-medium text-navy-900">
                  {r.quantity} {r.lubricant?.sparePart.unit} de {r.lubricant?.sparePart.name}
                </span>
              ),
            },
            { header: "Quem", accessor: (r) => r.laborResource?.name ?? "-" },
            {
              header: "Condição",
              accessor: (r) =>
                r.conditionBefore || r.conditionAfter
                  ? `${r.conditionBefore ? CONDICOES_DO_PONTO[r.conditionBefore] : "-"} -> ${r.conditionAfter ? CONDICOES_DO_PONTO[r.conditionAfter] : "-"}`
                  : "-",
            },
            { header: "OS", accessor: (r) => r.workOrder?.number ?? "-" },
          ]}
        />
      )}
    </div>
  );
}
