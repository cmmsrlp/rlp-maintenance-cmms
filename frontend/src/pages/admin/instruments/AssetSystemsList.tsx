import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { listPlants } from "../../../api/plants";
import { listAreas } from "../../../api/areas";
import { listAssetSystems, createAssetSystem, updateAssetSystem, deleteAssetSystem } from "../../../api/assetSystems";
import type { AssetSystem } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { useCmms } from "../../../lib/cmms";

const schema = z.object({ name: z.string().min(2, "Informe o nome do sistema."), code: z.string().optional() });
type FormValues = z.infer<typeof schema>;

/** Sistemas ficam dentro de uma Area, que fica dentro de uma Planta (dupla cascata). */
export default function AssetSystemsList() {
  const { assetsBase } = useCmms();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN" || user?.role === "TECHNICIAN";
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? user?.clientId ?? "" : searchParams.get("clientId") ?? "";
  const plantId = searchParams.get("plantId") ?? "";
  const areaId = searchParams.get("areaId") ?? "";

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AssetSystem | null>(null);

  const { data: plants } = useQuery({
    queryKey: ["plants-picker", clientId],
    queryFn: () => listPlants({ clientId, active: true }),
    enabled: !!clientId,
  });
  const { data: areas } = useQuery({
    queryKey: ["areas-picker", plantId],
    queryFn: () => listAreas({ plantId, active: true }),
    enabled: !!plantId,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["asset-systems", areaId],
    queryFn: () => listAssetSystems({ areaId }),
    enabled: !!areaId,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    // Trocar planta invalida a area escolhida (era filha da planta anterior).
    if (key === "plantId") next.delete("areaId");
    setSearchParams(next);
  }

  function openCreate() {
    reset({ name: "", code: "" });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(system: AssetSystem) {
    reset({ name: system.name, code: system.code ?? "" });
    setEditing(system);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name, code: values.code || null };
    try {
      if (editing) {
        await updateAssetSystem(editing.id, payload);
        notify("success", "Sistema atualizado.");
      } else {
        await createAssetSystem({ ...payload, areaId, clientId });
        notify("success", "Sistema cadastrado.");
      }
      reset();
      setCreateOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["asset-systems"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(system: AssetSystem) {
    try {
      await updateAssetSystem(system.id, { active: !system.active });
      queryClient.invalidateQueries({ queryKey: ["asset-systems"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(system: AssetSystem) {
    try {
      await deleteAssetSystem(system.id);
      notify("success", "Sistema removido.");
      queryClient.invalidateQueries({ queryKey: ["asset-systems"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Sistemas"
        description="Sistemas/maquinas dentro de cada area (ex.: Peneira 01)"
        breadcrumbs={[{ label: "Ativos", to: assetsBase }, { label: "Cadastros tecnicos", to: `${assetsBase}/cadastros` }, { label: "Sistemas" }]}
        actions={
          canManage &&
          areaId && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo sistema
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-56"
            value={clientId}
            onChange={(id) => setParam("clientId", id)}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione um cliente"
          />
        )}
        {clientId && (
          <select className="input sm:w-56" value={plantId} onChange={(e) => setParam("plantId", e.target.value)}>
            <option value="">Selecione uma planta</option>
            {(plants ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {plantId && (
          <select className="input sm:w-56" value={areaId} onChange={(e) => setParam("areaId", e.target.value)}>
            <option value="">Selecione uma area</option>
            {(areas ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
      </div>

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para comecar.</p>
      ) : !plants || plants.length === 0 ? (
        <EmptyState title="Nenhuma planta cadastrada" description="Cadastre uma planta e uma area antes de organizar os sistemas." />
      ) : !plantId ? (
        <p className="text-sm text-graphite-500">Selecione uma planta.</p>
      ) : !areas || areas.length === 0 ? (
        <EmptyState title="Nenhuma area cadastrada nesta planta" description="Cadastre uma area antes de organizar os sistemas." />
      ) : !areaId ? (
        <p className="text-sm text-graphite-500">Selecione uma area para ver os sistemas dela.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          keyField={(s) => s.id}
          emptyTitle="Nenhum sistema cadastrado"
          columns={[
            { header: "Nome", accessor: (s) => <span className="font-medium text-navy-900">{s.name}</span> },
            { header: "Codigo", accessor: (s) => <span className="text-xs text-graphite-500">{s.code ?? "-"}</span> },
            {
              header: "Status",
              accessor: (s) =>
                canManage ? (
                  <button onClick={() => toggleActive(s)} className="cursor-pointer">
                    <StatusBadge status={s.active ? "ACTIVE" : "INACTIVE"} />
                  </button>
                ) : (
                  <StatusBadge status={s.active ? "ACTIVE" : "INACTIVE"} />
                ),
            },
            {
              header: "",
              accessor: (s) =>
                canManage && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(s)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(s)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover">
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
        title={editing ? "Editar sistema" : "Novo sistema"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="asset-system-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="asset-system-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Peneira 01" error={errors.name?.message} {...register("name")} />
          <TextInput label="Codigo (opcional)" placeholder="Ex.: PE01" error={errors.code?.message} {...register("code")} />
        </form>
      </Modal>
    </div>
  );
}
