import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, CalendarDays, HardHat, Inbox, AlertTriangle, Search, X } from "lucide-react";
import { getMaintenanceSchedule, scheduleMaintenanceWorkOrder } from "../../../api/maintenanceWorkOrders";
import type { MaintenanceScheduleData, ScheduleCard } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";
import { iniciaisDe } from "../../../lib/pessoas";

const TYPE_STYLE: Record<string, { border: string; label: string }> = {
  PREVENTIVE: { border: "border-l-navy-500", label: "Preventiva" },
  CORRECTIVE: { border: "border-l-safety-red", label: "Corretiva" },
  PREDICTIVE: { border: "border-l-safety-yellow", label: "Preditiva" },
};

const PRIORITY_DOT: Record<string, string> = {
  LOW: "bg-graphite-300",
  MEDIUM: "bg-navy-400",
  HIGH: "bg-safety-yellow",
  CRITICAL: "bg-safety-red",
};

// Mesmo rotulo usado no resto do modulo (WorkOrderForm, WorkOrderDetail...) - aqui vira
// opcao de filtro, e nao so legenda do cartao.
const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta", CRITICAL: "Crítica" };

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

/** Segunda-feira da semana da data informada. */
function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, days: number) {
  const date = new Date(d);
  date.setDate(date.getDate() + days);
  return date;
}

/** Meio-dia local: evita que o fuso jogue a OS para o dia anterior/seguinte. */
function dayToIso(d: Date) {
  const date = new Date(d);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function isSameLocalDay(iso: string | null, day: Date) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getFullYear() === day.getFullYear() && d.getMonth() === day.getMonth() && d.getDate() === day.getDate();
}

const isToday = (day: Date) => isSameLocalDay(new Date().toISOString(), day);

/**
 * Quadro de programacao do PCM: a fila de OS a programar de um lado e a semana x mao de
 * obra do outro. Arrastar um cartao para uma celula define dia + responsavel; arrastar de
 * volta para a fila desprograma. O total de horas por celula mostra a carga do dia.
 */
export default function SchedulingBoard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { isClient, base, laborBase } = useCmms();

  const [clientId, setClientId] = useState("");
  // "" = todos. Filtrar por uma pessoa mostra so a semana dela, sem perder a fila de OS
  // a programar (que continua servindo de origem para o arrasta-e-solta).
  const [resourceId, setResourceId] = useState("");
  // Os quatro campos abaixo filtram os CARTOES (fila + celulas), diferente de resourceId
  // acima, que filtra as LINHAS mostradas. So havia filtro de pessoa - tipo, prioridade,
  // area e busca livre cobrem o que da pra ver no proprio cartao (cor da borda, bolinha,
  // TAG do ativo) sem ter que abrir cada OS pra confirmar.
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroArea, setFiltroArea] = useState("");
  const [busca, setBusca] = useState("");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [dragging, setDragging] = useState<ScheduleCard | null>(null);
  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = dayToIso(weekStart);
  const to = dayToIso(addDays(weekStart, 6));

  const queryKey = ["maintenance-schedule", clientId, from];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => getMaintenanceSchedule({ clientId: clientId || undefined, from, to }),
  });

  const mutation = useMutation({
    mutationFn: (vars: { id: string; scheduledDate: string | null; assignedResourceId: string | null }) =>
      scheduleMaintenanceWorkOrder(vars.id, { scheduledDate: vars.scheduledDate, assignedResourceId: vars.assignedResourceId }),
    // Move o cartao na hora e desfaz se o servidor recusar - arrastar precisa responder na hora.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<MaintenanceScheduleData>(queryKey);
      if (prev) {
        const card = [...prev.scheduled, ...prev.unscheduled].find((c) => c.id === vars.id);
        if (card) {
          const moved: ScheduleCard = { ...card, scheduledDate: vars.scheduledDate, assignedResourceId: vars.assignedResourceId };
          queryClient.setQueryData<MaintenanceScheduleData>(queryKey, {
            ...prev,
            scheduled: vars.scheduledDate
              ? [...prev.scheduled.filter((c) => c.id !== vars.id), moved]
              : prev.scheduled.filter((c) => c.id !== vars.id),
            unscheduled: vars.scheduledDate
              ? prev.unscheduled.filter((c) => c.id !== vars.id)
              : [...prev.unscheduled.filter((c) => c.id !== vars.id), moved],
          });
        }
      }
      return { prev };
    },
    onError: (error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
      notify("error", getApiErrorMessage(error));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  function drop(day: Date | null, resourceId: string | null) {
    setHoverKey(null);
    const card = dragging;
    setDragging(null);
    if (!card) return;
    const scheduledDate = day ? dayToIso(day) : null;
    // Nada mudou: nao gasta requisicao.
    if (card.scheduledDate === scheduledDate && card.assignedResourceId === resourceId) return;
    if (day && isSameLocalDay(card.scheduledDate, day) && card.assignedResourceId === resourceId) return;
    mutation.mutate({ id: card.id, scheduledDate, assignedResourceId: day ? resourceId : null });
  }

  const buscaNormalizada = busca.trim().toLowerCase();
  const passaNoFiltro = (c: ScheduleCard) =>
    (!filtroTipo || c.type === filtroTipo) &&
    (!filtroPrioridade || c.priority === filtroPrioridade) &&
    (!filtroArea || c.instrument?.area?.id === filtroArea) &&
    (!buscaNormalizada ||
      [c.number, c.description, c.instrument?.tag].some((v) => v?.toLowerCase().includes(buscaNormalizada)));

  const cardsFor = (day: Date, resourceId: string | null) =>
    (data?.scheduled ?? [])
      .filter((c) => isSameLocalDay(c.scheduledDate, day) && (c.assignedResourceId ?? null) === resourceId)
      .filter(passaNoFiltro);

  const filaFiltrada = (data?.unscheduled ?? []).filter(passaNoFiltro);

  // So oferece area que de fato aparece nas OS carregadas (fila + semana atual) - uma
  // lista vazia ou com area sem nenhuma OS so confundiria.
  const areasDisponiveis = Array.from(
    new Map(
      [...(data?.scheduled ?? []), ...(data?.unscheduled ?? [])]
        .map((c) => c.instrument?.area)
        .filter((a): a is { id: string; name: string } => !!a)
        .map((a) => [a.id, a] as const),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const filtrosAtivos = !!(filtroTipo || filtroPrioridade || filtroArea || busca.trim());

  const needsClient = !isClient && !clientId;

  return (
    <div>
      <PageHeader
        title="Programação da manutenção"
        description="Arraste as OS da fila para o dia e a pessoa que vai executar"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Programação" }]}
        actions={
          <div className="flex items-center gap-2">
            <button className="btn-outline" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
              <CalendarDays className="h-4 w-4" /> Hoje
            </button>
            <button className="btn-outline" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Proxima semana">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => {
              setClientId(id);
              setResourceId(""); // a equipe e' outra quando muda a empresa
            }}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione a empresa..."
          />
        )}
        {(data?.resources.length ?? 0) > 0 && (
          <select className="input sm:w-64" value={resourceId} onChange={(e) => setResourceId(e.target.value)}>
            <option value="">Todos os técnicos</option>
            {(data?.resources ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
            ))}
            <option value="unassigned">Sem responsável definido</option>
          </select>
        )}
        {!needsClient && (
          <>
            <select className="input sm:w-44" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos os tipos</option>
              {Object.entries(TYPE_STYLE).map(([valor, estilo]) => (
                <option key={valor} value={valor}>{estilo.label}</option>
              ))}
            </select>
            <select className="input sm:w-44" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}>
              <option value="">Toda prioridade</option>
              {Object.entries(PRIORITY_LABELS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
            {areasDisponiveis.length > 0 && (
              <select className="input sm:w-48" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
                <option value="">Toda área</option>
                {areasDisponiveis.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
              <input
                className="input w-56 pl-8"
                placeholder="Buscar OS, ativo ou serviço..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </>
        )}
        {(resourceId || filtrosAtivos) && (
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              setResourceId("");
              setFiltroTipo("");
              setFiltroPrioridade("");
              setFiltroArea("");
              setBusca("");
            }}
          >
            <X className="h-3.5 w-3.5" /> Limpar filtros
          </button>
        )}
      </div>

      {needsClient ? (
        <EmptyState title="Selecione a empresa" description="A programação é por empresa - escolha acima para montar o quadro." />
      ) : isLoading || !data ? (
        <FullPageSpinner />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          {/* Fila de OS a programar */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setHoverKey("backlog");
            }}
            onDragLeave={() => setHoverKey(null)}
            onDrop={() => drop(null, null)}
            className={`card shrink-0 p-4 lg:w-72 ${hoverKey === "backlog" ? "ring-2 ring-navy-400" : ""}`}
          >
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-navy-900">
              <Inbox className="h-4 w-4" /> A programar
              <span className="ml-auto rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700">
                {filtrosAtivos ? `${filaFiltrada.length} de ${data.unscheduled.length}` : data.unscheduled.length}
              </span>
            </h2>
            <p className="mb-3 text-xs text-graphite-500">
              Arraste para um dia no quadro. Solte aqui para desprogramar.
              {filtrosAtivos && " Os filtros também se aplicam às OS já programadas no quadro."}
            </p>
            <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
              {filaFiltrada.length === 0 ? (
                <p className="py-6 text-center text-sm text-graphite-400">
                  {filtrosAtivos ? "Nenhuma OS na fila com esses filtros." : "Nada na fila."}
                </p>
              ) : (
                filaFiltrada.map((card) => (
                  <Card key={card.id} card={card} onDragStart={() => setDragging(card)} onOpen={() => navigate(`${base}/ordens/${card.id}`)} />
                ))
              )}
            </div>
          </div>

          {/* Semana x mao de obra */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            {data.resources.length === 0 ? (
              <EmptyState
                title="Nenhuma mão de obra cadastrada"
                description="Cadastre a equipe de manutenção para distribuir as OS por pessoa."
                action={
                  <button className="btn-primary" onClick={() => navigate(laborBase)}>
                    <HardHat className="h-4 w-4" /> Cadastrar mão de obra
                  </button>
                }
              />
            ) : (
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[160px_repeat(7,minmax(0,1fr))] gap-1">
                  <div />
                  {days.map((day, i) => (
                    <div
                      key={day.toISOString()}
                      className={`rounded-t-lg px-2 py-1.5 text-center text-xs font-semibold ${
                        isToday(day) ? "bg-navy-700 text-white" : "bg-gray-100 text-graphite-600"
                      }`}
                    >
                      {WEEKDAYS[i]} {day.getDate().toString().padStart(2, "0")}/{(day.getMonth() + 1).toString().padStart(2, "0")}
                    </div>
                  ))}

                  {[
                    ...data.resources.map((r) => ({ id: r.id as string | null, name: r.name, type: r.type, photoUrl: r.photoUrl ?? null })),
                    { id: null as string | null, name: "Sem responsável", type: "definir depois", photoUrl: null },
                  ]
                    .filter((r) => !resourceId || (resourceId === "unassigned" ? r.id === null : r.id === resourceId))
                    .map(
                    (resource) => (
                      <Row
                        key={resource.id ?? "unassigned"}
                        resource={resource}
                        days={days}
                        cardsFor={cardsFor}
                        hoverKey={hoverKey}
                        setHoverKey={setHoverKey}
                        onDragStartCard={setDragging}
                        onDrop={drop}
                        onOpenCard={(id) => navigate(`${base}/ordens/${id}`)}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  resource,
  days,
  cardsFor,
  hoverKey,
  setHoverKey,
  onDragStartCard,
  onDrop,
  onOpenCard,
}: {
  resource: { id: string | null; name: string; type: string; photoUrl: string | null };
  days: Date[];
  cardsFor: (day: Date, resourceId: string | null) => ScheduleCard[];
  hoverKey: string | null;
  setHoverKey: (k: string | null) => void;
  onDragStartCard: (c: ScheduleCard) => void;
  onDrop: (day: Date | null, resourceId: string | null) => void;
  onOpenCard: (id: string) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 border-t border-gray-100 px-2 py-3">
        {/* Rosto antes do nome: no quadro cheio, reconhecer quem esta na linha pela foto e'
            mais rapido do que ler nomes parecidos. Sem foto, as iniciais mantem a coluna
            alinhada - um espaco vazio faria as linhas dancarem. */}
        {resource.photoUrl ? (
          <img src={resource.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-gray-200 object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">
            {iniciaisDe(resource.name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-navy-900">{resource.name}</p>
          <p className="truncate text-xs text-graphite-400">{resource.type}</p>
        </div>
      </div>
      {days.map((day) => {
        const cards = cardsFor(day, resource.id);
        const key = `${resource.id ?? "unassigned"}|${day.toISOString()}`;
        const hours = cards.reduce((sum, c) => sum + (c.laborHours ?? 0), 0);
        const withoutEstimate = cards.filter((c) => c.laborHours == null).length;
        const overloaded = hours > 8;
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              setHoverKey(key);
            }}
            onDragLeave={() => setHoverKey(null)}
            onDrop={() => onDrop(day, resource.id)}
            className={`min-h-[92px] space-y-1.5 border-t border-gray-100 p-1.5 transition-colors ${
              hoverKey === key ? "bg-navy-50 ring-2 ring-inset ring-navy-400" : isToday(day) ? "bg-navy-50/30" : ""
            }`}
          >
            {cards.map((card) => (
              <Card key={card.id} card={card} compact onDragStart={() => onDragStartCard(card)} onOpen={() => onOpenCard(card.id)} />
            ))}
            {cards.length > 0 && (
              <p className={`px-1 text-[10px] font-medium ${overloaded ? "text-safety-red" : "text-graphite-400"}`}>
                {hours > 0 ? `${hours}h` : "sem HH prevista"}
                {hours > 0 && withoutEstimate > 0 ? ` (+${withoutEstimate} sem HH)` : ""}
                {overloaded && (
                  <span className="ml-1 inline-flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" /> acima de 8h
                  </span>
                )}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function Card({
  card,
  compact,
  onDragStart,
  onOpen,
}: {
  card: ScheduleCard;
  compact?: boolean;
  onDragStart: () => void;
  onOpen: () => void;
}) {
  const style = TYPE_STYLE[card.type] ?? TYPE_STYLE.PREVENTIVE;
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      title={`${card.number} - ${card.description}`}
      className={`cursor-grab rounded-md border border-gray-200 border-l-4 bg-white p-1.5 shadow-sm transition-shadow hover:shadow-md active:cursor-grabbing ${style.border}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[card.priority]}`} title={`Prioridade: ${card.priority}`} />
        <span className="truncate text-xs font-semibold text-navy-900">{card.number}</span>
        {card.laborHours != null && <span className="ml-auto shrink-0 text-[10px] text-graphite-400">{card.laborHours}h</span>}
      </div>
      <p className={`mt-0.5 text-[11px] leading-tight text-graphite-600 ${compact ? "line-clamp-2" : "line-clamp-3"}`}>{card.description}</p>
      {card.instrument?.tag && <p className="mt-0.5 truncate text-[10px] text-graphite-400">{card.instrument.tag}</p>}
      {!compact && <p className="mt-1 text-[10px] font-medium text-graphite-400">{style.label}</p>}
    </div>
  );
}
