import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, GitBranch, Tags } from "lucide-react";
import { listInstruments } from "../../../api/instruments";
import type { InstrumentStatus, MaintenancePriority, OperationalStatus } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName, formatDate } from "../../../lib/format";
import { InstrumentFormModal } from "./InstrumentFormModal";
import { useAuth } from "../../../auth/AuthContext";

export default function InstrumentsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "TECHNICIAN";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InstrumentStatus | "">("");
  const [criticality, setCriticality] = useState<MaintenancePriority | "">("");
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["instruments", search, status, criticality, operationalStatus, page, clientId],
    queryFn: () => listInstruments({ search: search || undefined, status: status || undefined, criticality: criticality || undefined, operationalStatus: operationalStatus || undefined, page, pageSize: 15, clientId }),
  });

  return (
    <div>
      <PageHeader
        title="Ativos"
        description="Arvore de manutencao do parque de cada cliente"
        actions={
          <>
            {clientId && (
              <button className="btn-outline" onClick={() => navigate(`/gestao/manutencao/arvore?clientId=${clientId}`)}>
                <GitBranch className="h-4 w-4" /> Ver arvore
              </button>
            )}
            <button className="btn-outline" onClick={() => navigate("/gestao/ativos/cadastros")}>
              <Tags className="h-4 w-4" /> Cadastros tecnicos
            </button>
            {canManage && (
              <button className="btn-primary" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Novo ativo
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
            placeholder="Buscar por tag, modelo, numero de serie..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as InstrumentStatus | ""); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="VALID">Valido</option>
          <option value="DUE_SOON">Proximo do vencimento</option>
          <option value="EXPIRED">Vencido</option>
          <option value="IN_MAINTENANCE">Em manutencao</option>
        </select>
        <select className="input sm:w-56" value={criticality} onChange={(e) => { setCriticality(e.target.value as MaintenancePriority | ""); setPage(1); }}>
          <option value="">Todas as criticidades</option>
          <option value="CRITICAL">Critica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Media</option>
          <option value="LOW">Baixa</option>
        </select>
        <select className="input sm:w-56" value={operationalStatus} onChange={(e) => { setOperationalStatus(e.target.value as OperationalStatus | ""); setPage(1); }}>
          <option value="">Todas as condicoes operacionais</option>
          <option value="IN_OPERATION">Em operacao</option>
          <option value="STOPPED">Parado</option>
          <option value="STANDBY">Reserva</option>
          <option value="DEACTIVATED">Desativado</option>
          <option value="IN_MAINTENANCE">Em manutencao</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(i) => i.id}
        onRowClick={(i) => navigate(`/gestao/ativos/${i.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum ativo cadastrado"
        emptyDescription="Cadastre o primeiro ativo do parque para comecar a montar planos e ordens."
        emptyAction={
          canManage && (
            <button className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo ativo
            </button>
          )
        }
        columns={[
          {
            header: "Tag",
            // Filhos entram recuados, para a lista mostrar a arvore de ativos.
            accessor: (i) => (
              <span
                className={i.treeDepth ? "text-graphite-600" : ""}
                // Recuo pela profundidade real na arvore: com tres niveis, filho e neto
                // ficavam no mesmo lugar e a estrutura sumia.
                style={i.treeDepth ? { paddingLeft: i.treeDepth * 16 } : undefined}
              >
                {!!i.treeDepth && <span className="mr-1 text-graphite-300">&#8627;</span>}
                {i.tag ?? "-"}
              </span>
            ),
          },
          {
            header: "Ativo",
            accessor: (i) => (
              <div className="flex items-center gap-2.5">
                {/* Miniatura da foto: quem conhece o chao de fabrica reconhece o equipamento
                    muito antes de ler o TAG. Sem foto, nao ocupa espaco. */}
                {i.photoUrl && (
                  <img src={i.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">{i.description || i.type}</p>
                  <p className="text-xs text-graphite-400">{i.type}{i.model ? ` - ${i.model}` : ""}</p>
                </div>
              </div>
            ),
          },
          { header: "Componente de", accessor: (i) => (i.parent ? `TAG ${i.parent.tag ?? i.parent.type}` : "-") },
          { header: "Cliente", accessor: (i) => clientDisplayName(i.client) },
          { header: "Criticidade", accessor: (i) => <StatusBadge status={i.criticality} /> },
          { header: "Condicao", accessor: (i) => <StatusBadge status={i.operationalStatus} /> },
          { header: "Proxima calibracao", accessor: (i) => formatDate(i.nextDueDate) },
          { header: "Status", accessor: (i) => <StatusBadge status={i.derivedStatus ?? i.status} /> },
        ]}
      />

      <InstrumentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(instrument) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["instruments"] });
          navigate(`/gestao/ativos/${instrument.id}`);
        }}
      />
    </div>
  );
}
