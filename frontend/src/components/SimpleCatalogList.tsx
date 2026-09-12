import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageHeader } from "./PageHeader";
import { DataTable } from "./DataTable";
import { StatusBadge } from "./StatusBadge";
import { Modal } from "./Modal";
import { TextInput } from "./form/Field";
import { ClientFilterSelect } from "./ClientFilterSelect";
import { useToast } from "./Toast";
import { getApiErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";

/** Alguns catalogos sao identificados pelo NOME (planta, tipo de ativo) e outros pelo
 * NUMERO (centro de custo). O schema muda conforme isso, para a obrigatoriedade cair no
 * campo certo em vez de exigir os dois de todo mundo. */
function montarSchema(numeroObrigatorio: boolean) {
  return z.object({
    name: z.string().min(2, "Informe o nome."),
    code: numeroObrigatorio ? z.string().min(1, "Informe o numero.") : z.string().optional(),
  });
}
type FormValues = { name: string; code?: string };

interface CatalogItem {
  id: string;
  clientId: string;
  name: string;
  code: string | null;
  active: boolean;
}

interface Props<T extends CatalogItem> {
  title: string;
  description: string;
  itemLabel: string;
  namePlaceholder?: string;
  /** Rotulos e obrigatoriedade do segundo campo - centro de custo usa "Numero", obrigatorio. */
  nameLabel?: string;
  codeLabel?: string;
  codePlaceholder?: string;
  codeRequired?: boolean;
  /** Mostra o numero antes do nome na lista e no formulario: e' ele que identifica o item. */
  codeFirst?: boolean;
  breadcrumbs: { label: string; to?: string }[];
  base: string;
  list: (params: { clientId?: string; active?: boolean }) => Promise<T[]>;
  create: (input: { name: string; code?: string | null; clientId?: string | null }) => Promise<T>;
  update: (id: string, input: { name?: string; code?: string | null; active?: boolean }) => Promise<T>;
  del: (id: string) => Promise<void>;
}

/** Tela generica de catalogo simples por cliente (Planta, Centro de custo...): lista +
 * criar/editar/desativar/remover, sempre isolado por empresa (seletor de cliente na
 * gestao, forcado a propria empresa no portal). Reaproveitavel por qualquer catalogo
 * novo que seja so {nome, codigo} sem cascata de nivel acima. */
export function SimpleCatalogList<T extends CatalogItem>({
  title, description, itemLabel, namePlaceholder, nameLabel, codeLabel, codePlaceholder, codeRequired, codeFirst, breadcrumbs, base, list, create, update, del,
}: Props<T>) {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { user } = useAuth();
  const isClient = user?.role === "CLIENT";
  const canManage = isClient || user?.role === "ADMIN" || user?.role === "TECHNICIAN";
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? user?.clientId ?? "" : searchParams.get("clientId") ?? "";
  const queryKey = `catalog-${base}`;

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [queryKey, clientId],
    queryFn: () => list({ clientId }),
    enabled: !!clientId,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(montarSchema(!!codeRequired)),
  });

  function openCreate() {
    reset({ name: "", code: "" });
    setEditing(null);
    setCreateOpen(true);
  }
  function openEdit(item: T) {
    reset({ name: item.name, code: item.code ?? "" });
    setEditing(item);
    setCreateOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const payload = { name: values.name, code: values.code || null };
    try {
      if (editing) {
        await update(editing.id, payload);
        notify("success", `${itemLabel} atualizado(a).`);
      } else {
        await create({ ...payload, clientId });
        notify("success", `${itemLabel} cadastrado(a).`);
      }
      reset();
      setCreateOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(item: T) {
    try {
      await update(item.id, { active: !item.active });
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(item: T) {
    try {
      await del(item.id);
      notify("success", `${itemLabel} removido(a).`);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={breadcrumbs}
        actions={
          canManage &&
          clientId && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo(a) {itemLabel.toLowerCase()}
            </button>
          )
        }
      />

      {!isClient && (
        <div className="mb-4">
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione um cliente"
          />
        </div>
      )}

      {!clientId ? (
        <p className="text-sm text-graphite-500">Selecione um cliente para ver o cadastro.</p>
      ) : (
        <DataTable
          loading={isLoading}
          rows={data ?? []}
          keyField={(i) => i.id}
          emptyTitle={`Nenhum(a) ${itemLabel.toLowerCase()} cadastrado(a)`}
          columns={[
            ...(codeFirst
              ? [
                  { header: codeLabel ?? "Codigo", accessor: (i: T) => <span className="font-medium text-navy-900">{i.code ?? "-"}</span> },
                  { header: nameLabel ?? "Nome", accessor: (i: T) => <span className="text-graphite-700">{i.name}</span> },
                ]
              : [
                  { header: nameLabel ?? "Nome", accessor: (i: T) => <span className="font-medium text-navy-900">{i.name}</span> },
                  { header: codeLabel ?? "Codigo", accessor: (i: T) => <span className="text-xs text-graphite-500">{i.code ?? "-"}</span> },
                ]),
            {
              header: "Status",
              accessor: (i) =>
                canManage ? (
                  <button onClick={() => toggleActive(i)} className="cursor-pointer">
                    <StatusBadge status={i.active ? "ACTIVE" : "INACTIVE"} />
                  </button>
                ) : (
                  <StatusBadge status={i.active ? "ACTIVE" : "INACTIVE"} />
                ),
            },
            {
              header: "",
              accessor: (i) =>
                canManage && (
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(i)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(i)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover">
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
        title={editing ? `Editar ${itemLabel.toLowerCase()}` : `Novo(a) ${itemLabel.toLowerCase()}`}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="simple-catalog-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="simple-catalog-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {/* O campo que identifica o item vem primeiro. Num centro de custo isso e' o
              numero: o nome dele costuma repetir o da area e nao serve para distinguir. */}
          {codeFirst ? (
            <>
              <TextInput
                label={codeLabel ?? "Codigo"}
                required={codeRequired}
                placeholder={codePlaceholder ?? "Ex.: F01"}
                error={errors.code?.message}
                {...register("code")}
              />
              <TextInput label={nameLabel ?? "Nome"} required placeholder={namePlaceholder} error={errors.name?.message} {...register("name")} />
            </>
          ) : (
            <>
              <TextInput label={nameLabel ?? "Nome"} required placeholder={namePlaceholder} error={errors.name?.message} {...register("name")} />
              <TextInput
                label={codeLabel ?? "Codigo (opcional)"}
                required={codeRequired}
                placeholder={codePlaceholder ?? "Ex.: F01"}
                error={errors.code?.message}
                {...register("code")}
              />
            </>
          )}
        </form>
      </Modal>
    </div>
  );
}
