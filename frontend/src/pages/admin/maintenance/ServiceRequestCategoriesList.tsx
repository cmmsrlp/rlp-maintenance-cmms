import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listServiceRequestCategories,
  createServiceRequestCategory,
  updateServiceRequestCategory,
  deleteServiceRequestCategory,
} from "../../../api/serviceRequestCategories";
import type { ServiceRequestCategory } from "../../../api/types";
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

const schema = z.object({ name: z.string().min(2, "Informe o nome da categoria.") });
type FormValues = z.infer<typeof schema>;

/** Catalogo de categorias de solicitacao (ex.: Eletrica, Mecanica, Instrumentacao) - existia
 * no backend desde sempre, mas nao tinha nenhuma tela para cadastrar: o campo "Categoria" na
 * nova solicitacao ficava sempre vazio porque nao havia como criar uma opcao (achado em
 * auditoria). Mesmo padrao do catalogo de Motivos de parada. */
export default function ServiceRequestCategoriesList() {
  const { base } = useCmms();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN";
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRequestCategory | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["service-request-categories"],
    queryFn: () => listServiceRequestCategories(),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function canEdit(category: ServiceRequestCategory) {
    if (!canManage) return false;
    return isClient ? category.clientId === user?.clientId : true;
  }

  function openCreate() {
    reset({ name: "" });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(category: ServiceRequestCategory) {
    reset({ name: category.name });
    setEditing(category);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    try {
      if (editing) {
        await updateServiceRequestCategory(editing.id, values);
        notify("success", "Categoria atualizada.");
      } else {
        await createServiceRequestCategory(values);
        notify("success", "Categoria criada.");
      }
      reset();
      setCreateOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["service-request-categories"] });
      queryClient.invalidateQueries({ queryKey: ["service-request-categories-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(category: ServiceRequestCategory) {
    if (!canEdit(category)) return;
    try {
      await updateServiceRequestCategory(category.id, { active: !category.active });
      queryClient.invalidateQueries({ queryKey: ["service-request-categories"] });
      queryClient.invalidateQueries({ queryKey: ["service-request-categories-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(category: ServiceRequestCategory) {
    try {
      await deleteServiceRequestCategory(category.id);
      notify("success", "Categoria removida.");
      queryClient.invalidateQueries({ queryKey: ["service-request-categories"] });
      queryClient.invalidateQueries({ queryKey: ["service-request-categories-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Categorias de solicitação"
        description="Catálogo usado para classificar uma solicitação de serviço ao abri-la"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Categorias de solicitação" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Nova categoria
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={data ?? []}
        keyField={(r) => r.id}
        emptyTitle="Nenhuma categoria cadastrada"
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
        title={editing ? "Editar categoria" : "Nova categoria de solicitação"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="service-request-category-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="service-request-category-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Elétrica" error={errors.name?.message} {...register("name")} />
        </form>
      </Modal>
    </div>
  );
}
