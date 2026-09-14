import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listMaintenancePlans } from "../../../api/maintenancePlans";
import type { MaintenancePlan } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { AutomationPanel } from "./AutomationPanel";
import { clientDisplayName, formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

export default function MaintenancePlansList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const instrumentId = searchParams.get("instrumentId") ?? undefined;
  const { canManage, isClient, base } = useCmms();

  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-plans", page, clientId, instrumentId],
    queryFn: () => listMaintenancePlans({ page, pageSize: 15, clientId, instrumentId }),
  });

  return (
    <div>
      <PageHeader
        title="Planos de manutenção"
        description="Manutenção preventiva por tempo ou por medidor"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Planos" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => navigate(`${base}/planos/novo`)}>
              <Plus className="h-4 w-4" /> Novo plano
            </button>
          )
        }
      />

      {/* E' o cliente quem liga/pausa a propria geracao automatica - nao aparece na
          Gestao (isClient e' falso ali), so' no portal de quem planeja. */}
      {isClient && canManage && (
        <AutomationPanel onRodou={() => queryClient.invalidateQueries({ queryKey: ["maintenance-plans"] })} />
      )}

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(p) => p.id}
        onRowClick={(p) => navigate(`${base}/planos/${p.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum plano de manutenção cadastrado"
        emptyDescription="Monte o primeiro plano preventivo e atribua a um ou mais ativos."
        emptyAction={
          canManage && (
            <button className="btn-primary btn-sm" onClick={() => navigate(`${base}/planos/novo`)}>
              <Plus className="h-4 w-4" /> Novo plano
            </button>
          )
        }
        columns={[
          { header: "Plano", accessor: (p) => <span className="font-medium text-navy-900">{p.name}</span> },
          ...(isClient ? [] : [{ header: "Cliente", accessor: (p: MaintenancePlan) => clientDisplayName(p.client) }]),
          { header: "Ativo", accessor: (p) => p.instrument?.tag ?? "-" },
          { header: "Disparo", accessor: (p) => (p.triggerType === "TIME" ? `A cada ${p.frequencyDays} dias` : `Medidor: ${p.meter?.name ?? "-"}`) },
          { header: "Próximo vencimento", accessor: (p) => (p.triggerType === "TIME" ? formatDate(p.nextDueDate) : "-") },
          { header: "Status", accessor: (p) => <StatusBadge status={p.active ? (p.derivedStatus ?? "VALID") : "INACTIVE"} /> },
        ]}
      />
    </div>
  );
}
