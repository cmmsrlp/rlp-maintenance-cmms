import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, CalendarRange } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listSchedules, createSchedule } from "../../../api/shutdownSchedules";
import type { ShutdownScheduleStatus } from "../../../api/types";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";
import { formatDate } from "../../../lib/format";

const schema = z.object({ name: z.string().min(2, "Dê um nome para o cronograma.") });
type FormValues = z.infer<typeof schema>;

const OPCOES_DE_STATUS: { value: ShutdownScheduleStatus; label: string }[] = [
  { value: "PLANNING", label: "Planejamento" },
  { value: "IN_PROGRESS", label: "Em execução" },
  { value: "DONE", label: "Concluído" },
];

/**
 * Cronogramas de parada programada - a lista de tarefas de cada parada (tipo Project),
 * com ativo, datas, sequencia e OS vinculada por tarefa. Cada linha aqui e' um cronograma
 * salvo que pode ser reaberto e editado a qualquer momento.
 */
export default function ShutdownSchedulesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { base, isClient, ownClientId } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? (ownClientId ?? "") : (searchParams.get("clientId") ?? "");
  const [status, setStatus] = useState<ShutdownScheduleStatus | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["shutdown-schedules", clientId, status, page],
    queryFn: () => listSchedules({ clientId, status: status || undefined, page, pageSize: 15 }),
    enabled: !!clientId,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      const created = await createSchedule({ ...values, clientId });
      notify("success", `Cronograma "${created.name}" criado.`);
      reset();
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["shutdown-schedules"] });
      navigate(`${base}/cronogramas-parada/${created.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Cronogramas de parada"
        description="Cronograma tipo projeto para paradas programadas - ativo, sequência, datas e OS de cada tarefa"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Cronogramas de parada" }]}
        actions={
          clientId && (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Novo cronograma
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        )}
        {clientId && (
          <select className="input sm:w-56" value={status} onChange={(e) => { setStatus(e.target.value as ShutdownScheduleStatus | ""); setPage(1); }}>
            <option value="">Todos os status</option>
            {OPCOES_DE_STATUS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para ver os cronogramas de parada dele.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data?.items ?? []}
          keyField={(r) => r.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhum cronograma cadastrado"
          emptyDescription="Crie um cronograma para montar a sequência de tarefas de uma parada programada."
          columns={[
            {
              header: "Cronograma",
              accessor: (r) => (
                <Link to={`${base}/cronogramas-parada/${r.id}`} className="flex items-center gap-2 font-medium text-navy-900 hover:underline">
                  <CalendarRange className="h-4 w-4 shrink-0 text-graphite-400" />
                  {r.name}
                </Link>
              ),
            },
            { header: "Tarefas", accessor: (r) => r.taskCount },
            { header: "Inicio", accessor: (r) => (r.startDate ? formatDate(r.startDate) : "-") },
            { header: "Fim", accessor: (r) => (r.endDate ? formatDate(r.endDate) : "-") },
            { header: "Status", accessor: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Novo cronograma de parada"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="shutdown-schedule-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Criando..." : "Criar e abrir"}
            </button>
          </>
        }
      >
        <form id="shutdown-schedule-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <TextInput
            label="Nome"
            required
            placeholder="Ex.: Parada programada Linha 4 - Dez/2026"
            error={errors.name?.message}
            {...register("name")}
          />
          <p className="mt-3 text-xs text-graphite-500">Depois de criar, monte a lista de tarefas na propria tela do cronograma.</p>
        </form>
      </Modal>
    </div>
  );
}
