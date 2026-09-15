import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, GitBranch, Tags } from "lucide-react";
import { listInstruments } from "../../api/instruments";
import type { MaintenancePriority } from "../../api/types";
import { PageHeader } from "../../components/PageHeader";
import { DataTable } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { formatDate } from "../../lib/format";
import { PortalInstrumentFormModal } from "./PortalInstrumentFormModal";

export default function PortalInstruments() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [criticality, setCriticality] = useState<MaintenancePriority | "">("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-instruments", page, criticality],
    queryFn: () => listInstruments({ page, pageSize: 15, criticality: criticality || undefined }),
  });

  return (
    <div>
      <PageHeader
        title="Meus ativos"
        description="Equipamentos cadastrados sob sua responsabilidade"
        actions={
          <>
            <button className="btn-outline" onClick={() => navigate("/portal/manutencao/arvore")}>
              <GitBranch className="h-4 w-4" /> Ver árvore
            </button>
            <button className="btn-outline" onClick={() => navigate("/portal/ativos/cadastros")}>
              <Tags className="h-4 w-4" /> Cadastros técnicos
            </button>
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo ativo
            </button>
          </>
        }
      />

      <div className="mb-4">
        <select
          className="input sm:w-56"
          value={criticality}
          onChange={(e) => { setCriticality(e.target.value as MaintenancePriority | ""); setPage(1); }}
        >
          <option value="">Todas as criticidades</option>
          <option value="CRITICAL">Crítica</option>
          <option value="HIGH">Alta</option>
          <option value="MEDIUM">Média</option>
          <option value="LOW">Baixa</option>
        </select>
      </div>

      <DataTable
        loading={isLoading}
        rows={data?.items ?? []}
        keyField={(i) => i.id}
        onRowClick={(i) => navigate(`/portal/ativos/${i.id}`)}
        pagination={data}
        onPageChange={setPage}
        emptyTitle="Nenhum ativo cadastrado"
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
          { header: "Ativo", accessor: (i) => (<div><p className="font-medium text-navy-900">{i.description || i.type}</p><p className="text-xs text-graphite-400">{i.type}{i.model ? ` - ${i.model}` : ""}</p></div>) },
          { header: "Componente de", accessor: (i) => (i.parent ? `TAG ${i.parent.tag ?? i.parent.type}` : "-") },
          { header: "Número de série", accessor: (i) => i.serialNumber },
          { header: "Criticidade", accessor: (i) => <StatusBadge status={i.criticality} /> },
          { header: "Próxima calibração", accessor: (i) => formatDate(i.nextDueDate) },
          { header: "Status", accessor: (i) => <StatusBadge status={i.derivedStatus ?? i.status} /> },
        ]}
      />

      <PortalInstrumentFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={(instrument) => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: ["portal-instruments"] });
          navigate(`/portal/ativos/${instrument.id}`);
        }}
      />
    </div>
  );
}
