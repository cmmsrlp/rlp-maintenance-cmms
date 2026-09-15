import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listLaborTypes, createLaborType, updateLaborType, deleteLaborType } from "../../../api/laborTypes";
import type { LaborType } from "../../../api/types";
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

const schema = z.object({ name: z.string().min(2, "Informe o nome da função.") });
type FormValues = z.infer<typeof schema>;

/**
 * Catalogo de funcoes da equipe (Tecnico mecanico, Eletricista, Lubrificador...) - a lista
 * fechada que o cadastro de mao de obra usa. Mesmo padrao dos outros catalogos: o padrao
 * da RLP Maintenance vem pronto e cada empresa acrescenta o que faltar.
 */
export default function LaborTypesList() {
  const { base } = useCmms();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN";
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LaborType | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["labor-types"], queryFn: () => listLaborTypes() });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  /** O catalogo padrao da RLP Maintenance e' compartilhado por todos os clientes - so a equipe
   * interna mexe nele. Cada empresa edita apenas o que ela mesma cadastrou. */
  function canEdit(type: LaborType) {
    if (!canManage) return false;
    return isClient ? type.clientId === user?.clientId : true;
  }

  function openCreate() {
    reset({ name: "" });
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(type: LaborType) {
    reset({ name: type.name });
    setEditing(type);
    setFormOpen(true);
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["labor-types"] });
    queryClient.invalidateQueries({ queryKey: ["labor-types-picker"] });
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await updateLaborType(editing.id, values);
        notify("success", "Função atualizada.");
      } else {
        await createLaborType(values);
        notify("success", "Função cadastrada.");
      }
      reset();
      setFormOpen(false);
      setEditing(null);
      refresh();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(type: LaborType) {
    if (!canEdit(type)) return;
    try {
      await updateLaborType(type.id, { active: !type.active });
      refresh();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(type: LaborType) {
    try {
      await deleteLaborType(type.id);
      notify("success", "Função removida.");
      refresh();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Tipos de mão de obra"
        description="Funções da equipe usadas no cadastro de mão de obra e no HH planejado dos planos"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Tipos de mão de obra" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova função
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={data ?? []}
        keyField={(r) => r.id}
        emptyTitle="Nenhuma função cadastrada"
        columns={[
          { header: "Função", accessor: (r) => <span className="font-medium text-navy-900">{r.name}</span> },
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar função" : "Nova função"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" form="labor-type-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="labor-type-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Função" required placeholder="Ex.: Técnico mecânico" error={errors.name?.message} {...register("name")} />
        </form>
      </Modal>
    </div>
  );
}
