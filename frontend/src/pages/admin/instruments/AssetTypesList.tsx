import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { listAssetTypes, createAssetType, updateAssetType, deleteAssetType } from "../../../api/assetTypes";
import type { AssetType } from "../../../api/types";
import { ASSET_LEVEL_LABELS, ASSET_LEVEL_OPTIONS } from "../../../lib/assetHierarchy";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useAuth } from "../../../auth/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Informe o nome do tipo."),
  level: z.enum(["PLANT", "AREA", "MACHINE", "SUBASSEMBLY", "PART"]).optional().or(z.literal("")),
  codePrefix: z.string().trim().max(10, "No máximo 10 caracteres.").optional(),
});
type FormValues = z.infer<typeof schema>;

/** Catalogo pre-cadastrado do campo "Tipo de ativo" - hoje representa o nivel do ativo
 * na hierarquia funcional (Planta/Area/Maquina/Subconjunto/Parte), nao o tipo de
 * equipamento. Cadastro de tipo novo e edicao acontecem so aqui (o formulario de ativo
 * so escolhe entre o que ja existe). */
export default function AssetTypesList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN" || user?.role === "TECHNICIAN";
  const base = isClient ? "/portal/ativos" : "/gestao/ativos";
  const [createOpen, setCreateOpen] = useState(false);
  const [editingType, setEditingType] = useState<AssetType | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["asset-types"], queryFn: () => listAssetTypes() });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  function canEdit(type: AssetType) {
    if (!canManage) return false;
    return isClient ? type.clientId === user?.clientId : true;
  }

  function openCreate() {
    reset({ name: "", level: "", codePrefix: "" });
    setEditingType(null);
    setCreateOpen(true);
  }

  function openEdit(type: AssetType) {
    reset({ name: type.name, level: type.level ?? "", codePrefix: type.codePrefix ?? "" });
    setEditingType(type);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name, level: values.level || null, codePrefix: values.codePrefix?.toUpperCase() || null };
    try {
      if (editingType) {
        await updateAssetType(editingType.id, payload);
        notify("success", "Tipo de ativo atualizado.");
      } else {
        await createAssetType(payload);
        notify("success", "Tipo de ativo criado.");
      }
      reset();
      setCreateOpen(false);
      setEditingType(null);
      queryClient.invalidateQueries({ queryKey: ["asset-types"] });
      queryClient.invalidateQueries({ queryKey: ["asset-types-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(type: AssetType) {
    if (!canEdit(type)) return;
    try {
      await updateAssetType(type.id, { active: !type.active });
      queryClient.invalidateQueries({ queryKey: ["asset-types"] });
      queryClient.invalidateQueries({ queryKey: ["asset-types-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(type: AssetType) {
    try {
      await deleteAssetType(type.id);
      notify("success", "Tipo removido.");
      queryClient.invalidateQueries({ queryKey: ["asset-types"] });
      queryClient.invalidateQueries({ queryKey: ["asset-types-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Tipos de ativo"
        description="Catálogo usado no campo Tipo de ativo do cadastro"
        breadcrumbs={[{ label: "Ativos", to: base }, { label: "Cadastros técnicos", to: `${base}/cadastros` }, { label: "Tipos de ativo" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo tipo
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={data ?? []}
        keyField={(t) => t.id}
        emptyTitle="Nenhum tipo cadastrado"
        columns={[
          { header: "Nome", accessor: (t) => <span className="font-medium text-navy-900">{t.name}</span> },
          {
            header: "Nível",
            accessor: (t) => <span className="text-xs text-graphite-500">{t.level ? ASSET_LEVEL_LABELS[t.level] : "-"}</span>,
          },
          {
            header: "Prefixo do código",
            accessor: (t) => <span className="font-mono text-xs text-graphite-500">{t.codePrefix ?? "-"}</span>,
          },
          {
            header: "Origem",
            accessor: (t) => <span className="text-xs text-graphite-500">{t.clientId ? "Meu catálogo" : "Padrão RLP Maintenance"}</span>,
          },
          {
            header: "Status",
            accessor: (t) =>
              canEdit(t) ? (
                <button onClick={() => toggleActive(t)} className="cursor-pointer">
                  <StatusBadge status={t.active ? "ACTIVE" : "INACTIVE"} />
                </button>
              ) : (
                <StatusBadge status={t.active ? "ACTIVE" : "INACTIVE"} />
              ),
          },
          {
            header: "",
            accessor: (t) =>
              canEdit(t) && (
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(t)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar tipo">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(t)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover tipo">
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
        title={editingType ? "Editar tipo de ativo" : "Novo tipo de ativo"}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="asset-type-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="asset-type-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Planta, Máquina, Subconjunto" error={errors.name?.message} {...register("name")} />
          <SelectInput
            label="Nível na árvore"
            hint="Define o ícone deste tipo na árvore de ativos. Deixe em branco para um tipo antigo/específico."
            placeholder="Sem nível definido"
            options={ASSET_LEVEL_OPTIONS}
            error={errors.level?.message}
            {...register("level")}
          />
          <TextInput
            label="Prefixo do código (opcional)"
            placeholder="Ex.: MOT"
            hint='Usado só pelo cadastro de Equipamentos recondicionáveis - com isso preenchido, o código (ex.: "MOT-001") é sugerido sozinho ao escolher este tipo.'
            error={errors.codePrefix?.message}
            {...register("codePrefix")}
          />
        </form>
      </Modal>
    </div>
  );
}
