import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, Download, Printer } from "lucide-react";
import { listMaintenanceWorkOrders, getMaintenanceWorkOrder } from "../../../api/maintenanceWorkOrders";
import { getClient, getOwnClient } from "../../../api/clients";
import type { MaintenanceOrderStatus, MaintenanceOrderType, MaintenanceWorkOrder } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge, statusLabel } from "../../../components/StatusBadge";
import { clientDisplayName, formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { buildCsv, downloadCsv } from "../../../lib/csvExport";
import { imprimirVariasOS } from "../../../lib/printWorkOrder";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";

import { rotuloDoTipo } from "../../../lib/maintenanceLabels";

/** Teto de paginas buscadas pra exportar - 100 por pagina (limite da API), ate 20 paginas
 * (2.000 ordens). Cobre qualquer exportacao real sem deixar a tela travada buscando pra
 * sempre num filtro largo demais. */
const MAX_EXPORT_PAGES = 20;

export default function WorkOrdersList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const instrumentId = searchParams.get("instrumentId") ?? undefined;
  const { canManage, isClient, base } = useCmms();
  const { notify } = useToast();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MaintenanceOrderStatus | "">("");
  // Preditiva chega pre-filtrada via link do menu ("Manutencao preditiva"), mas continua
  // um filtro comum - o usuario pode trocar para outro tipo ou limpar normalmente.
  const [type, setType] = useState<MaintenanceOrderType | "">((searchParams.get("type") as MaintenanceOrderType) || "");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [imprimindo, setImprimindo] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-work-orders", search, status, type, page, clientId, instrumentId],
    queryFn: () =>
      listMaintenanceWorkOrders({ search: search || undefined, status: status || undefined, type: type || undefined, page, pageSize: 15, clientId, instrumentId }),
  });

  async function exportarCsv() {
    setExporting(true);
    try {
      const filtros = { search: search || undefined, status: status || undefined, type: type || undefined, clientId, instrumentId };
      const todas: MaintenanceWorkOrder[] = [];
      let paginaAtual = 1;
      let totalPaginas = 1;
      do {
        const resultado = await listMaintenanceWorkOrders({ ...filtros, page: paginaAtual, pageSize: 100 });
        todas.push(...resultado.items);
        totalPaginas = resultado.totalPages;
        paginaAtual += 1;
      } while (paginaAtual <= totalPaginas && paginaAtual <= MAX_EXPORT_PAGES);

      if (todas.length === 0) {
        notify("error", "Nenhuma ordem para exportar com este filtro.");
        return;
      }

      const csv = buildCsv(todas, [
        { label: "Número", value: (o) => o.number },
        ...(isClient ? [] : [{ label: "Cliente", value: (o: MaintenanceWorkOrder) => clientDisplayName(o.client) }]),
        { label: "Ativo", value: (o) => o.instrument?.tag ?? "" },
        { label: "Tipo", value: (o) => rotuloDoTipo(o.type, o.correctiveType) },
        ...(isClient ? [] : [{ label: "Técnico", value: (o: MaintenanceWorkOrder) => o.technician?.name ?? "" }]),
        { label: "Agendada", value: (o) => formatDate(o.scheduledDate) },
        { label: "Status", value: (o) => statusLabel(o.status) },
      ]);
      downloadCsv(`ordens-de-manutencao-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    } finally {
      setExporting(false);
    }
  }

  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function imprimirSelecionadas() {
    setImprimindo(true);
    try {
      // Cada linha da lista traz so o resumo - checklist, pecas e mao de obra vem do
      // detalhe completo, que so a tela de uma OS busca normalmente.
      const ordens = await Promise.all(Array.from(selecionadas).map((id) => getMaintenanceWorkOrder(id)));
      if (ordens.length === 0) return;
      let logoUrl: string | null = null;
      try {
        const client = isClient ? await getOwnClient() : await getClient(ordens[0].clientId);
        logoUrl = client.logoUrl ?? null;
      } catch {
        // Sem logo nao impede a impressao.
      }
      imprimirVariasOS(ordens, logoUrl);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setImprimindo(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Ordens de manutenção"
        description="OS preventivas e corretivas"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Ordens" }]}
        actions={
          <>
            {selecionadas.size > 0 && (
              <button className="btn-outline" disabled={imprimindo} onClick={() => void imprimirSelecionadas()}>
                <Printer className="h-4 w-4" /> {imprimindo ? "Preparando..." : `Imprimir selecionadas (${selecionadas.size})`}
              </button>
            )}
            <button className="btn-outline" onClick={exportarCsv} disabled={exporting}>
              <Download className="h-4 w-4" /> {exporting ? "Exportando..." : "Exportar CSV"}
            </button>
            {canManage && (
              <button className="btn-primary" onClick={() => navigate(`${base}/ordens/novo`)}>
                <Plus className="h-4 w-4" /> Nova OS
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por número..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as MaintenanceOrderStatus | ""); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="OPEN">Aberta</option>
          <option value="IN_TRIAGE">Em triagem</option>
          <option value="PLANNED">Planejada</option>
          <option value="PROGRAMMED">Programada</option>
          <option value="RELEASED">Liberada</option>
          <option value="IN_PROGRESS">Em execução</option>
          <option value="AWAITING_MATERIAL">Aguardando material</option>
          <option value="AWAITING_RELEASE">Aguardando liberação</option>
          <option value="AWAITING_STOPPAGE">Aguardando parada</option>
          <option value="COMPLETED">Concluída</option>
          <option value="CANCELED">Cancelada</option>
        </select>
        <select className="input sm:w-56" value={type} onChange={(e) => { setType(e.target.value as MaintenanceOrderType | ""); setPage(1); }}>
          <option value="">Todos os tipos</option>
          <option value="PREVENTIVE">Preventiva</option>
          <option value="CORRECTIVE">Corretiva</option>
          <option value="PREDICTIVE">Preditiva</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(o) => o.id}
        onRowClick={(o) => navigate(`${base}/ordens/${o.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhuma ordem de manutenção"
        emptyDescription="Ordens nascem sozinhas dos planos preventivos, ou crie uma corretiva na hora."
        emptyAction={
          canManage && (
            <button className="btn-primary btn-sm" onClick={() => navigate(`${base}/ordens/novo`)}>
              <Plus className="h-4 w-4" /> Nova ordem
            </button>
          )
        }
        columns={[
          {
            header: "",
            className: "w-8",
            accessor: (o) => (
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selecionadas.has(o.id)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => alternarSelecao(o.id)}
              />
            ),
          },
          { header: "Número", accessor: (o) => <span className="font-medium text-navy-900">{o.number}</span> },
          ...(isClient ? [] : [{ header: "Cliente", accessor: (o: MaintenanceWorkOrder) => clientDisplayName(o.client) }]),
          { header: "Ativo", accessor: (o) => o.instrument?.tag ?? "-" },
          { header: "Tipo", accessor: (o) => rotuloDoTipo(o.type, o.correctiveType) },
          ...(isClient ? [] : [{ header: "Técnico", accessor: (o: MaintenanceWorkOrder) => o.technician?.name ?? "-" }]),
          { header: "Agendada", accessor: (o) => formatDate(o.scheduledDate) },
          { header: "Status", accessor: (o) => <StatusBadge status={o.status} /> },
        ]}
      />
    </div>
  );
}
