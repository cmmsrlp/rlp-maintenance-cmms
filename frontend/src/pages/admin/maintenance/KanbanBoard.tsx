import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { listMaintenanceWorkOrders, updateMaintenanceWorkOrder } from "../../../api/maintenanceWorkOrders";
import type { MaintenanceOrderStatus, MaintenanceWorkOrder } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { clientDisplayName } from "../../../lib/format";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";

// Mesma paleta semantica do StatusBadge - agrupa visualmente o estagio do fluxo:
// grafite (fila), navy (planejada/liberada), amarelo (em movimento/bloqueada), verde (feita).
const COLUMN_TONE_CLASSES = {
  graphite: "border-t-graphite-300 bg-graphite-50",
  navy: "border-t-navy-400 bg-navy-50/60",
  yellow: "border-t-safety-yellow bg-amber-50/60",
  green: "border-t-safety-green bg-green-50/60",
} as const;

const COLUMNS: { status: MaintenanceOrderStatus; label: string; tone: keyof typeof COLUMN_TONE_CLASSES }[] = [
  { status: "OPEN", label: "Aberta", tone: "graphite" },
  { status: "IN_TRIAGE", label: "Em triagem", tone: "yellow" },
  { status: "PLANNED", label: "Planejada", tone: "navy" },
  { status: "PROGRAMMED", label: "Programada", tone: "navy" },
  { status: "RELEASED", label: "Liberada", tone: "navy" },
  { status: "IN_PROGRESS", label: "Em execucao", tone: "yellow" },
  { status: "AWAITING_MATERIAL", label: "Aguardando material", tone: "yellow" },
  { status: "AWAITING_RELEASE", label: "Aguardando liberacao", tone: "yellow" },
  { status: "AWAITING_STOPPAGE", label: "Aguardando parada", tone: "yellow" },
  { status: "COMPLETED", label: "Concluida", tone: "green" },
];

// "Concluida" fica de fora do seletor rapido do cartao - so pela ficha da OS (botao
// "Concluir"), que valida o checklist e fecha a Solicitacao de Servico vinculada,
// efeitos que um PATCH generico de status nao replica.
const CARD_STATUS_OPTIONS = [...COLUMNS.filter((c) => c.status !== "COMPLETED"), { status: "CANCELED" as const, label: "Cancelada" }];

/** Quadro visual da OS agrupada por estagio - sem arrastar e soltar por enquanto, so um
 * seletor rapido de status em cada cartao (evita adicionar uma biblioteca de drag-and-drop
 * so pra isso; o valor do Kanban aqui e' ver o fluxo de um relance, nao o gesto de arrastar). */
export default function KanbanBoard() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const { isClient, base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";

  const { data, isLoading } = useQuery({
    queryKey: ["kanban-work-orders", clientId],
    queryFn: () => listMaintenanceWorkOrders({ clientId: clientId || undefined, pageSize: 300 }),
  });

  async function handleStatusChange(workOrderId: string, status: MaintenanceOrderStatus) {
    try {
      await updateMaintenanceWorkOrder(workOrderId, { status });
      queryClient.invalidateQueries({ queryKey: ["kanban-work-orders"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  const items = data?.items ?? [];
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Kanban de manutencao"
        description="OS agrupadas por estagio do fluxo"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Kanban" }]}
      />

      {!isClient && (
        <div className="mb-4">
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
          />
        </div>
      )}

      {isLoading ? (
        <FullPageSpinner />
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-4">
            {COLUMNS.map((col) => {
              const colItems = items.filter((w) => w.status === col.status);
              return (
                <div key={col.status} className={`w-64 shrink-0 rounded-lg border-t-4 p-2.5 ${COLUMN_TONE_CLASSES[col.tone]}`}>
                  <div className="mb-2 flex items-center justify-between px-1">
                    <h3 className="text-sm font-semibold text-navy-900">{col.label}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-navy-700 shadow-sm">{colItems.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colItems.map((w) => (
                      <KanbanCard key={w.id} workOrder={w} now={now} isClient={isClient} onOpen={() => navigate(`${base}/ordens/${w.id}`)} onStatusChange={(s) => handleStatusChange(w.id, s)} />
                    ))}
                    {colItems.length === 0 && <p className="px-1 text-xs text-graphite-400">Vazio</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function KanbanCard({
  workOrder, now, isClient, onOpen, onStatusChange,
}: {
  workOrder: MaintenanceWorkOrder;
  now: Date;
  isClient: boolean;
  onOpen: () => void;
  onStatusChange: (status: MaintenanceOrderStatus) => void;
}) {
  const overdue = workOrder.scheduledDate && new Date(workOrder.scheduledDate) < now && workOrder.status !== "COMPLETED" && workOrder.status !== "CANCELED";
  const critical = workOrder.priority === "CRITICAL";

  return (
    <div className={`card space-y-1.5 p-3 text-sm ${critical ? "border-safety-red/40" : ""}`}>
      <button type="button" onClick={onOpen} className="block w-full text-left font-medium text-navy-900 hover:underline">
        {workOrder.number}
      </button>
      {!isClient && <p className="text-xs text-graphite-500">{clientDisplayName(workOrder.client)}</p>}
      <p className="text-xs text-graphite-600">{workOrder.instrument?.tag ?? "-"}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {critical && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-safety-red">
            <AlertTriangle className="h-3 w-3" /> Critica
          </span>
        )}
        {overdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-safety-yellow-dark">
            Atrasada
          </span>
        )}
      </div>
      {workOrder.status === "COMPLETED" ? (
        <StatusBadge status={workOrder.status} />
      ) : (
        <select
          className="input w-full py-1 text-xs"
          value={workOrder.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onStatusChange(e.target.value as MaintenanceOrderStatus)}
        >
          {CARD_STATUS_OPTIONS.map((opt) => (
            <option key={opt.status} value={opt.status}>{opt.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
