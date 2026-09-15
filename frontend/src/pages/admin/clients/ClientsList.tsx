import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { listClients } from "../../../api/clients";
import type { ClientStatus } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName } from "../../../lib/format";
import { ClientFormModal } from "./ClientFormModal";
import { useAuth } from "../../../auth/AuthContext";

export default function ClientsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "COMMERCIAL";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClientStatus | "">("");
  const [service, setService] = useState<"" | "CMMS_MAINTENANCE">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", search, status, service, page],
    queryFn: () => listClients({ search: search || undefined, status: status || undefined, service: service || undefined, page, pageSize: 15 }),
  });

  return (
    <div>
      <PageHeader
        title="Clientes"
        description="Empresas atendidas pela RLP Maintenance"
        actions={
          canManage && (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="input sm:w-56"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ClientStatus | "");
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="INACTIVE">Inativo</option>
          <option value="PROSPECT">Prospecto</option>
        </select>
        <select
          className="input sm:w-56"
          value={service}
          onChange={(e) => {
            setService(e.target.value as "" | "CMMS_MAINTENANCE");
            setPage(1);
          }}
        >
          <option value="">Todos os clientes</option>
          <option value="CMMS_MAINTENANCE">Com CMMS ativo</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(c) => c.id}
        onRowClick={(c) => navigate(`/gestao/clientes/${c.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum cliente cadastrado"
        emptyDescription="Cadastre o primeiro cliente para começar."
        emptyAction={
          canManage && (
            <button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo cliente
            </button>
          )
        }
        columns={[
          { header: "Empresa", accessor: (c) => <span className="font-medium text-navy-900">{clientDisplayName(c)}</span> },
          { header: "Cidade", accessor: (c) => c.addressCity ?? "-" },
          {
            header: "CMMS",
            accessor: (c) =>
              c.contractedServices.includes("CMMS_MAINTENANCE") ? (
                <span className="rounded-full border border-safety-green/40 bg-safety-green/10 px-2 py-0.5 text-[11px] font-medium text-safety-green-dark">
                  Ativo
                </span>
              ) : (
                <span className="text-graphite-400">Não ativado</span>
              ),
          },
          { header: "Plano", accessor: (c) => (c.plan ? <span className="text-xs font-medium text-navy-700">{c.plan.name}</span> : <span className="text-graphite-400">-</span>) },
          { header: "Status", accessor: (c) => <StatusBadge status={c.status} /> },
        ]}
      />

      <ClientFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(client) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["clients"] });
          navigate(`/gestao/clientes/${client.id}`);
        }}
      />
    </div>
  );
}
