import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listStoppageReasons, createStoppageReason, updateStoppageReason, deleteStoppageReason } from "../../../api/stoppageReasons";
import type { StoppageReason } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { useCmms } from "../../../lib/cmms";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({ name: z.string().min(2, "Informe o nome do motivo.") });
type FormValues = z.infer<typeof schema>;

/** Catalogo de motivos de parada (ex.: falta de material, quebra) - mesmo padrao do
 * Codigos de falha: catalogo padrao da RLP Maintenance + o que cada empresa cadastra. */
export default function StoppageReasonsList() {
  const { base } = useCmms();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN";
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StoppageReason | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["stoppage-reasons"], queryFn: () => listStoppageReasons() });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function canEdit(reason: StoppageReason) {
    if (!canManage) return false;
    return isClient ? reason.clientId === user?.clientId : true;
  }

  function openCreate() {
    reset({ name: "" });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(reason: StoppageReason) {
    reset({ name: reason.name });
    setEditing(reason);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await updateStoppageReason(editing.id, values);
        notify("success", "Motivo atualizado.");
      } else {
        await createStoppageReason(values);
        notify("success", "Motivo criado.");
      }
      reset();
      setCreateOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons"] });
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(reason: StoppageReason) {
    if (!canEdit(reason)) return;
    try {
      await updateStoppageReason(reason.id, { active: !reason.active });
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons"] });
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(reason: StoppageReason) {
    try {
      await deleteStoppageReason(reason.id);
      notify("success", "Motivo removido.");
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons"] });
      queryClient.invalidateQueries({ queryKey: ["stoppage-reasons-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Motivos de parada"
        description="Catálogo usado ao registrar uma parada de ativo durante a OS"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Motivos de parada" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo motivo
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={data ?? []}
        keyField={(r) => r.id}
        emptyTitle="Nenhum motivo cadastrado"
        columns={[
          { header: "Nome", accessor: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
          {
            header: "Origem",
            accessor: (r) => <span className="text-xs text-graphite-500">{r.clientId ? "Meu catálogo" : "Padrão RLP Maintenance"}</span>,
          },
          {
            header: "Status",
            accessor: (r) =>
              canEdit(r) ? (
                <button onClick={() => toggleActive(r)} className="cursor-pointer">
                  <StatusBadge status={r.active ? "ACTIVE" : "INACTIVE"} />
                </button>
              ) : (
                <StatusBadge status={r.active ? "ACTIVE" : "INACTIVE"} />
              ),
          },
          {
            header: "",
            accessor: (r) =>
              canEdit(r) && (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(r)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(r)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
          },
        ]}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={editing ? "Editar motivo" : "Novo motivo de parada"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="stoppage-reason-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="stoppage-reason-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Falta de material" error={errors.name?.message} {...register("name")} />
        </form>
      </Modal>
    </div>
  );
}
