import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, GitBranch, Tags, Building2 } from "lucide-react";
import { listInstruments } from "../../../api/instruments";
import { listClients, getClient } from "../../../api/clients";
import type { InstrumentStatus, MaintenancePriority, OperationalStatus } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName, formatDate } from "../../../lib/format";
import { InstrumentFormModal } from "./InstrumentFormModal";
import { useAuth } from "../../../auth/AuthContext";

export default function InstrumentsList() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;

  return clientId ? <AtivosDoCliente clientId={clientId} /> : <AtivosPorCliente />;
}

/**
 * Entrada de "Ativos": em vez de uma lista unica com o parque inteiro de todos os
 * clientes misturado, mostra quantos ativos cada cliente tem. Clicar num cliente abre
 * a lista detalhada dele (AtivosDoCliente, o comportamento que a tela inteira tinha
 * antes de virar um resumo por cliente).
 */
function AtivosPorCliente() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["clients-ativos-summary", search, page],
    queryFn: () => listClients({ search: search || undefined, page, pageSize: 15 }),
  });

  return (
    <div>
      <PageHeader
        title="Ativos"
        description="Quantidade de ativos cadastrados por cliente"
        actions={
          <>
            <button className="btn-outline" onClick={() => navigate("/gestao/ativos/cadastros")}>
              <Tags className="h-4 w-4" /> Cadastros técnicos
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo ativo
            </button>
          </>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            className="input pl-9"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(c) => c.id}
        onRowClick={(c) => navigate(`/gestao/ativos?clientId=${c.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum cliente cadastrado"
        emptyDescription="Cadastre um cliente para começar a montar o parque de ativos dele."
        columns={[
          {
            header: "Cliente",
            accessor: (c) => (
              <div className="flex items-center gap-2.5">
                {c.logoUrl ? (
                  <img src={c.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-md border border-gray-200 object-cover" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy-50">
                    <Building2 className="h-4 w-4 text-navy-400" />
                  </div>
                )}
                <span className="font-medium text-navy-900">{clientDisplayName(c)}</span>
              </div>
            ),
          },
          { header: "Cidade", accessor: (c) => c.addressCity ?? "-" },
          {
            header: "Ativos",
            accessor: (c) => (
              <span className="rounded-full bg-navy-50 px-2.5 py-0.5 text-xs font-semibold text-navy-700">
                {c._count?.instruments ?? 0}
              </span>
            ),
          },
        ]}
      />

      <InstrumentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(instrument) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["clients-ativos-summary"] });
          navigate(`/gestao/ativos/${instrument.id}`);
        }}
      />
    </div>
  );
}

/** Lista detalhada dos ativos de um unico cliente - identica a tela de "Ativos" de antes,
 * so que sempre filtrada (chegada aqui pelo resumo por cliente acima, ou por um link com
 * ?clientId=). */
function AtivosDoCliente({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "TECHNICIAN";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InstrumentStatus | "">("");
  const [criticality, setCriticality] = useState<MaintenancePriority | "">("");
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: client } = useQuery({ queryKey: ["client", clientId], queryFn: () => getClient(clientId) });

  const { data, isLoading } = useQuery({
    queryKey: ["instruments", search, status, criticality, operationalStatus, page, clientId],
    queryFn: () =>
      listInstruments({
        search: search || undefined,
        status: status || undefined,
        criticality: criticality || undefined,
        operationalStatus: operationalStatus || undefined,
        page,
        pageSize: 15,
        clientId,
      }),
  });

  return (
    <div>
      <PageHeader
        title={client ? clientDisplayName(client) : "Ativos"}
        description="Árvore de manutenção do parque deste cliente"
        breadcrumbs={[{ label: "Ativos", to: "/gestao/ativos" }, { label: client ? clientDisplayName(client) : "..." }]}
        actions={
          <>
            <button className="btn-outline" onClick={() => navigate(`/gestao/manutencao/arvore?clientId=${clientId}`)}>
              <GitBranch className="h-4 w-4" /> Ver árvore
            </button>
            <button className="btn-outline" onClick={() => navigate("/gestao/ativos/cadastros")}>
              <Tags className="h-4 w-4" /> Cadastros técnicos
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
            placeholder="Buscar por tag, modelo, número de série..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as InstrumentStatus | ""); setPage(1); }}>
          <option value="">Todos os status</option>
          <option value="VALID">Válido</option>
          <option value="DUE_SOON">Próximo do vencimento</option>
          <option value="EXPIRED">Vencido</option>
          <option value="IN_MAINTENANCE">Em manutenção</option>
        </select>
        <select className="input sm:w-56" value={criticality} onChange={(e) => { setCriticality(e.target.value as MaintenancePriority | ""); setPage(1); }}>
          <option value="">Todas as criticidades</option>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </select>
        <select className="input sm:w-56" value={operationalStatus} onChange={(e) => { setOperationalStatus(e.target.value as OperationalStatus | ""); setPage(1); }}>
          <option value="">Todas as condições operacionais</option>
          <option value="IN_OPERATION">Em operação</option>
          <option value="STOPPED">Parado</option>
          <option value="STANDBY">Reserva</option>
          <option value="DEACTIVATED">Desativado</option>
          <option value="IN_MAINTENANCE">Em manutenção</option>
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
        emptyDescription="Cadastre o primeiro ativo do parque para começar a montar planos e ordens."
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
          { header: "Criticidade", accessor: (i) => <StatusBadge status={i.criticality} /> },
          { header: "Condição", accessor: (i) => <StatusBadge status={i.operationalStatus} /> },
          { header: "Próxima calibração", accessor: (i) => formatDate(i.nextDueDate) },
          { header: "Status", accessor: (i) => <StatusBadge status={i.derivedStatus ?? i.status} /> },
        ]}
      />

      <InstrumentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initialClientId={clientId}
        onSaved={(instrument) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["instruments"] });
          navigate(`/gestao/ativos/${instrument.id}`);
        }}
      />
    </div>
  );
}
