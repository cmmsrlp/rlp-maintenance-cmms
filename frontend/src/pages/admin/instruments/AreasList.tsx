import { useState } from "react";
import { centroDeCustoComDescricao } from "../../../lib/centroDeCusto";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { listPlants } from "../../../api/plants";
import { listAreas, createArea, updateArea, deleteArea } from "../../../api/areas";
import type { Area } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { listCostCenters } from "../../../api/costCenters";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { useCmms } from "../../../lib/cmms";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da área."),
  code: z.string().optional(),
  // Centro de custo padrao: todo ativo dentro da area herda este centro de custo.
  costCenterCode: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Areas ficam dentro de uma Planta (cascata) - escolhe a planta primeiro pra saber
 * dentro de qual delas gerenciar as areas. */
export default function AreasList() {
  const { assetsBase } = useCmms();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN" || user?.role === "TECHNICIAN";
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? user?.clientId ?? "" : searchParams.get("clientId") ?? "";
  const plantId = searchParams.get("plantId") ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Area | null>(null);

  const { data: plants } = useQuery({
    queryKey: ["plants-picker", clientId],
    queryFn: () => listPlants({ clientId, active: true }),
    enabled: !!clientId,
  });
  const { data: costCenters } = useQuery({
    queryKey: ["cost-centers-picker", clientId],
    queryFn: () => listCostCenters({ clientId, active: true }),
    enabled: !!clientId,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["areas", clientId, plantId],
    queryFn: () => listAreas({ clientId, plantId }),
    enabled: !!clientId && !!plantId,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function openCreate() {
    reset({ name: "", code: "", costCenterCode: "" });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(area: Area) {
    reset({ name: area.name, code: area.code ?? "", costCenterCode: area.costCenter?.code ?? area.costCenter?.name ?? "" });
    setEditing(area);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name, code: values.code || null, costCenterCode: values.costCenterCode?.trim() ?? "" };
    try {
      if (editing) {
        await updateArea(editing.id, payload);
        notify("success", "Área atualizada.");
      } else {
        await createArea({ ...payload, plantId, clientId });
        notify("success", "Área cadastrada.");
      }
      reset();
      setCreateOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(area: Area) {
    try {
      await updateArea(area.id, { active: !area.active });
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(area: Area) {
    try {
      await deleteArea(area.id);
      notify("success", "Área removida.");
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Áreas / Centros de custo"
        description="Cada área da planta e o centro de custo em que ela rateia - um cadastro só, porque o centro existe por causa da área"
        breadcrumbs={[{ label: "Ativos", to: assetsBase }, { label: "Cadastros técnicos", to: `${assetsBase}/cadastros` }, { label: "Áreas / Centros de custo" }]}
        actions={
          canManage &&
          plantId && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova área
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-64"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione um cliente"
          />
        )}
        {clientId && (
          <select
            className="input sm:w-64"
            value={plantId}
            onChange={(e) => setSearchParams(isClient ? { plantId: e.target.value } : { clientId, plantId: e.target.value })}
          >
            <option value="">Selecione uma planta</option>
            {(plants ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para ver as plantas.</p>
      ) : !plants || plants.length === 0 ? (
        <EmptyState title="Nenhuma planta cadastrada" description="Cadastre uma planta antes de organizar as áreas." />
      ) : !plantId ? (
        <p className="text-sm text-graphite-500">Selecione uma planta para ver as áreas dela.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          keyField={(a) => a.id}
          emptyTitle="Nenhuma área cadastrada"
          columns={[
            { header: "Nome", accessor: (a) => <span className="font-medium text-navy-900">{a.name}</span> },
            { header: "Código", accessor: (a) => <span className="text-xs text-graphite-500">{a.code ?? "-"}</span> },
            { header: "Centro de custo", accessor: (a) => (a.costCenter ? centroDeCustoComDescricao(a.costCenter) : <span className="text-graphite-400">Nenhum</span>) },
            {
              header: "Status",
              accessor: (a) =>
                canManage ? (
                  <button onClick={() => toggleActive(a)} className="cursor-pointer">
                    <StatusBadge status={a.active ? "ACTIVE" : "INACTIVE"} />
                  </button>
                ) : (
                  <StatusBadge status={a.active ? "ACTIVE" : "INACTIVE"} />
                ),
            },
            {
              header: "",
              accessor: (a) =>
                canManage && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(a)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(a)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ),
            },
          ]}
        />
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Editar área" : "Nova área"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="area-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="area-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Recebimento de matéria-prima" error={errors.name?.message} {...register("name")} />
          <TextInput label="Código (opcional)" placeholder="Ex.: RMP" error={errors.code?.message} {...register("code")} />
          <TextInput
            label="Centro de custo (número)"
            placeholder="Ex.: 108"
            list="centros-de-custo-existentes"
            hint="Digite o número. Se já existir, é reaproveitado; se não, é criado agora. Todo ativo desta área - e todos os filhos dele - herdam este centro de custo."
            error={errors.costCenterCode?.message}
            {...register("costCenterCode")}
          />
          {/* Sugestoes do que a empresa ja usa, sem fechar a lista: um centro novo se
              digita aqui mesmo, que e' o motivo de area e centro terem virado um cadastro so. */}
          <datalist id="centros-de-custo-existentes">
            {(costCenters ?? []).map((c) => (
              <option key={c.id} value={c.code ?? c.name} label={c.code ? c.name : undefined} />
            ))}
          </datalist>
        </form>
      </Modal>
    </div>
  );
}
