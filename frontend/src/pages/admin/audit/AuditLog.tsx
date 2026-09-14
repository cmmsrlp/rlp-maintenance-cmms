import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, listOwnAuditLogs } from "../../../api/audit";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { formatDateTime } from "../../../lib/format";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Criacao",
  UPDATE: "Atualizacao",
  DELETE: "Exclusao",
  APPROVE: "Aprovacao",
  PUBLISH: "Publicacao",
  HIDE: "Ocultacao",
  LOGIN: "Login",
};

const ENTITY_OPTIONS = [
  "Instrument",
  "MaintenanceWorkOrder",
  "MaintenancePlan",
  "ServiceRequest",
  "RotableEquipment",
  "ShutdownSchedule",
  "SparePart",
  "User",
];

interface AuditLogProps {
  /** true = so' a auditoria da propria empresa (portal do cliente). Mesma tela, endpoint
   * diferente - o backend e' quem garante o escopo, aqui e' so' qual chamar. */
  own?: boolean;
}

export default function AuditLog({ own = false }: AuditLogProps) {
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: [own ? "audit-logs-minha-empresa" : "audit-logs", entityType, page],
    queryFn: () => (own ? listOwnAuditLogs : listAuditLogs)({ entityType: entityType || undefined, page, pageSize: 20 }),
  });

  return (
    <div>
      <PageHeader
        title="Auditoria"
        description={own ? "Registro de acoes feitas pela sua equipe no sistema" : "Registro de acoes relevantes no sistema"}
      />

      <div className="mb-4 max-w-xs">
        <select className="input" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <option value="">Todos os registros</option>
          {ENTITY_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(l) => l.id}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum registro de auditoria"
        columns={[
          { header: "Data", accessor: (l) => formatDateTime(l.createdAt) },
          { header: "Usuario", accessor: (l) => l.user?.name ?? "Sistema" },
          { header: "Acao", accessor: (l) => ACTION_LABELS[l.action] ?? l.action },
          { header: "Entidade", accessor: (l) => l.entityType },
          { header: "Descricao", accessor: (l) => l.description ?? "-" },
        ]}
      />
    </div>
  );
}
