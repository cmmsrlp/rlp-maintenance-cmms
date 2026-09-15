import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { listServiceRequests } from "../../../api/serviceRequests";
import type { ServiceRequest, ServiceRequestStatus } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName, formatDateTime } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

export default function ServiceRequestsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const { isClient, base } = useCmms();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ServiceRequestStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["service-requests", search, status, page, clientId],
    queryFn: () => listServiceRequests({ search: search || undefined, status: status || undefined, page, pageSize: 15, clientId }),
  });

  return (
    <div>
      <PageHeader
        title="Solicitações de serviço"
        description="Porta de entrada do CMMS - qualquer necessidade de manutenção antes de virar OS"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Solicitações" }]}
        actions={
          <button className="btn-primary" onClick={() => navigate(`${base}/solicitacoes/novo`)}>
            <Plus className="h-4 w-4" /> Nova solicitação
          </button>
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
        <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as ServiceRequestStatus | ""); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="OPEN">Aberta</option>
          <option value="IN_TRIAGE">Em triagem</option>
          <option value="AWAITING_INFO">Aguardando informação</option>
          <option value="PLANNED">Planejada</option>
          <option value="CONVERTED">Convertida em OS</option>
          <option value="REJECTED">Rejeitada</option>
          <option value="CLOSED">Encerrada</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(r) => r.id}
        onRowClick={(r) => navigate(`${base}/solicitacoes/${r.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhuma solicitação de serviço"
        columns={[
          { header: "Número", accessor: (r) => <span className="font-medium text-navy-900">{r.number}</span> },
          ...(isClient ? [] : [{ header: "Cliente", accessor: (r: ServiceRequest) => clientDisplayName(r.client) }]),
          { header: "Ativo", accessor: (r) => r.instrument?.tag ?? "-" },
          { header: "Descrição", accessor: (r) => <span className="line-clamp-1 max-w-xs">{r.description}</span> },
          {
            header: "Impacto",
            accessor: (r) => (r.safetyImpact || r.qualityImpact || r.productionImpact
              ? <AlertTriangle className="h-4 w-4 text-safety-yellow" aria-label="Tem impacto reportado" />
              : "-"),
          },
          { header: "Aberta em", accessor: (r) => formatDateTime(r.createdAt) },
          { header: "Status", accessor: (r) => <StatusBadge status={r.status} label={r.status === "REJECTED" ? "Rejeitada" : undefined} /> },
        ]}
      />
    </div>
  );
}
