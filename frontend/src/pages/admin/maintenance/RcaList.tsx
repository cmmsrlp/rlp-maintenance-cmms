import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listRootCauseAnalyses } from "../../../api/rootCauseAnalyses";
import type { RcaStatus, RootCauseAnalysis } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName, formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

const STATUS_LABELS: Record<RcaStatus, string> = { OPEN: "Aberta", IN_PROGRESS: "Em andamento", CLOSED: "Encerrada" };

export default function RcaList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const { isClient, base } = useCmms();

  const [status, setStatus] = useState<RcaStatus | "">("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["rca-list", status, page, clientId],
    queryFn: () => listRootCauseAnalyses({ status: status || undefined, page, pageSize: 15, clientId }),
  });

  return (
    <div>
      <PageHeader
        title="RCA / 5 Porquês"
        description="Análise de causa raiz de falhas críticas ou recorrentes"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "RCA" }]}
        actions={
          <button className="btn-primary" onClick={() => navigate(`${base}/rca/novo`)}>
            <Plus className="h-4 w-4" /> Nova RCA
          </button>
        }
      />

      <div className="mb-4">
        <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as RcaStatus | ""); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="OPEN">Aberta</option>
          <option value="IN_PROGRESS">Em andamento</option>
          <option value="CLOSED">Encerrada</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(r) => r.id}
        onRowClick={(r) => navigate(`${base}/rca/${r.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhuma RCA aberta"
        columns={[
          { header: "Problema", accessor: (r) => <span className="line-clamp-1 font-medium text-navy-900">{r.problem}</span> },
          ...(isClient ? [] : [{ header: "Cliente", accessor: (r: RootCauseAnalysis) => clientDisplayName(r.client) }]),
          { header: "Ativo", accessor: (r) => r.instrument?.tag ?? "-" },
          { header: "Responsável", accessor: (r) => r.responsible?.name ?? "-" },
          { header: "Prazo", accessor: (r) => formatDate(r.dueDate) },
          { header: "Status", accessor: (r) => <StatusBadge status={r.status} label={STATUS_LABELS[r.status]} /> },
        ]}
      />
    </div>
  );
}
