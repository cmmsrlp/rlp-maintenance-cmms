import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, AlertTriangle, ClipboardList, User } from "lucide-react";
import { listServiceRequests } from "../../../api/serviceRequests";
import type { ServiceRequest, ServiceRequestStatus } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { clientDisplayName, formatDateTime } from "../../../lib/format";
import { rotuloDoStatusSS } from "../../../lib/serviceRequestStatus";
import { useCmms } from "../../../lib/cmms";

// Mesma paleta semantica do StatusBadge - agrupa visualmente o estagio da solicitacao:
// grafite (ainda sem retorno da equipe), amarelo/navy/verde (o card de cada uma mostra o
// proprio status, diferenciado por cor via StatusBadge - a coluna do meio junta 4 status
// diferentes, entao a cor real vem do badge, nao do topo da coluna).
const COLUMN_TONE_CLASSES = {
  graphite: "border-t-graphite-300 bg-graphite-50",
  navy: "border-t-navy-400 bg-navy-50/60",
} as const;

const COLUMNS: { key: string; label: string; statuses: ServiceRequestStatus[]; tone: keyof typeof COLUMN_TONE_CLASSES }[] = [
  { key: "aberta", label: "Aberta - sem parecer", statuses: ["OPEN"], tone: "graphite" },
  { key: "tratativa", label: "Em tratativa", statuses: ["IN_TRIAGE", "AWAITING_INFO", "PLANNED", "CONVERTED"], tone: "navy" },
  { key: "encerrada", label: "Concluída / cancelada", statuses: ["CLOSED", "REJECTED", "CANCELED"], tone: "graphite" },
];

export default function ServiceRequestsList() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? undefined;
  const { isClient, base } = useCmms();

  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["service-requests", search, clientId],
    queryFn: () => listServiceRequests({ search: search || undefined, pageSize: 500, clientId }),
  });

  const items = data?.items ?? [];

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

      <div className="mb-4">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por número..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <FullPageSpinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const colItems = items.filter((r) => col.statuses.includes(r.status));
            return (
              <div key={col.key} className={`rounded-lg border-t-4 p-2.5 ${COLUMN_TONE_CLASSES[col.tone]}`}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h3 className="text-sm font-semibold text-navy-900">{col.label}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-navy-700 shadow-sm">{colItems.length}</span>
                </div>
                <div className="space-y-2">
                  {colItems.map((r) => (
                    <ServiceRequestCard key={r.id} request={r} isClient={isClient} onOpen={() => navigate(`${base}/solicitacoes/${r.id}`)} />
                  ))}
                  {colItems.length === 0 && <p className="px-1 text-xs text-graphite-400">Vazio</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ServiceRequestCard({ request, isClient, onOpen }: { request: ServiceRequest; isClient: boolean; onOpen: () => void }) {
  const temImpacto = request.safetyImpact || request.qualityImpact || request.productionImpact;
  return (
    <button type="button" onClick={onOpen} className="card block w-full space-y-1.5 p-3 text-left text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-navy-900">{request.number}</span>
        {temImpacto && <AlertTriangle className="h-4 w-4 shrink-0 text-safety-yellow" aria-label="Tem impacto reportado" />}
      </div>
      {!isClient && <p className="text-xs text-graphite-500">{clientDisplayName(request.client)}</p>}
      <p className="text-xs text-graphite-600">{request.instrument?.tag ?? "-"}</p>
      <p className="line-clamp-2 text-xs text-graphite-700">{request.description}</p>
      <p className="flex items-center gap-1 text-[11px] text-graphite-400">
        <User className="h-3 w-3 shrink-0" /> {request.requestedBy?.name ?? "-"}
        <span className="text-graphite-300">·</span> {formatDateTime(request.createdAt)}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status={request.status} label={rotuloDoStatusSS(request.status)} />
        {request.workOrder && (
          <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700">
            <ClipboardList className="h-3 w-3" /> {request.workOrder.number}
          </span>
        )}
      </div>
    </button>
  );
}
