import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { listPlans, createPlan, updatePlan, deletePlan } from "../../../api/plans";
import type { Plan } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { TextInput, TextareaInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { formatCurrency } from "../../../lib/format";

// z.coerce.number() sozinho nao trata campo vazio como "sem limite": Number("") e' 0, nao
// NaN, entao "" passava no coerce e so' quebrava depois no .positive() - com o campo
// silenciosamente virando erro em vez de "sem limite" (foi exatamente o que aconteceu
// tentando reverter um limite de volta pra vazio depois de editado). O preprocess trata
// "" como undefined antes do coerce, pra .optional() de fato liberar o campo em branco.
const semLimite = (v: unknown) => (v === "" ? undefined : v);
const schema = z.object({
  name: z.string().min(2, "Informe o nome do plano."),
  description: z.string().optional(),
  priceMonthly: z.preprocess(semLimite, z.coerce.number().nonnegative().optional()),
  maxUsers: z.preprocess(semLimite, z.coerce.number().int().positive().optional()),
  maxInstruments: z.preprocess(semLimite, z.coerce.number().int().positive().optional()),
  features: z.array(z.object({ value: z.string().min(1, "Descreva o item.") })),
});
type FormValues = z.infer<typeof schema>;

/** Catalogo de planos comerciais (Plus/Pro/Advanced...) - define limites de usuarios e
 * ativos aplicados na ficha do cliente. Sem integracao de cobranca: e' so atribuicao de
 * plano + limite tecnico, o preco mensal aqui e' informativo (usado no MRR estimado). */
export default function PlansList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => listPlans() });

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const { fields, append, remove } = useFieldArray({ control, name: "features" });

  function openCreate() {
    reset({ name: "", description: "", features: [] });
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(plan: Plan) {
    reset({
      name: plan.name,
      description: plan.description ?? "",
      priceMonthly: plan.priceMonthly ?? undefined,
      maxUsers: plan.maxUsers ?? undefined,
      maxInstruments: plan.maxInstruments ?? undefined,
      features: plan.features.map((f) => ({ value: f })),
    });
    setEditing(plan);
    setFormOpen(true);
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      priceMonthly: values.priceMonthly ?? null,
      maxUsers: values.maxUsers ?? null,
      maxInstruments: values.maxInstruments ?? null,
      features: values.features.map((f) => f.value).filter(Boolean),
    };
    try {
      if (editing) {
        await updatePlan(editing.id, payload);
        notify("success", "Plano atualizado.");
      } else {
        await createPlan(payload);
        notify("success", "Plano criado.");
      }
      setFormOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(plan: Plan) {
    try {
      await updatePlan(plan.id, { active: !plan.active });
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(plan: Plan) {
    try {
      await deletePlan(plan.id);
      notify("success", "Plano removido.");
      queryClient.invalidateQueries({ queryKey: ["plans"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Planos"
        description="Planos comerciais oferecidos aos clientes - definem limites de usuarios e ativos"
        breadcrumbs={[{ label: "Administracao da plataforma", to: "/gestao/plataforma" }, { label: "Planos" }]}
        actions={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Novo plano
          </button>
        }
      />

      <DataTable
        loading={isLoading}
        rows={plans ?? []}
        keyField={(p) => p.id}
        emptyTitle="Nenhum plano cadastrado"
        columns={[
          { header: "Plano", accessor: (p) => <span className="font-medium text-navy-900">{p.name}</span> },
          { header: "Preco mensal", accessor: (p) => (p.priceMonthly != null ? formatCurrency(p.priceMonthly) : "Sob consulta") },
          { header: "Limite de usuarios", accessor: (p) => p.maxUsers ?? "Sem limite" },
          { header: "Limite de ativos", accessor: (p) => p.maxInstruments ?? "Sem limite" },
          { header: "Clientes", accessor: (p) => p._count?.clients ?? 0 },
          {
            header: "Status",
            accessor: (p) => (
              <button onClick={() => toggleActive(p)} className="cursor-pointer">
                <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
              </button>
            ),
          },
          {
            header: "",
            accessor: (p) => (
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(p)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar plano">
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(p)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover plano">
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
        title={editing ? "Editar plano" : "Novo plano"}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" form="plan-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="plan-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome do plano" required placeholder="Ex.: Plus, Pro, Advanced" error={errors.name?.message} {...register("name")} />
          <TextareaInput label="Descricao (opcional)" rows={2} {...register("description")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Preco mensal (opcional)" type="number" step="any" hint="Vazio = Sob consulta (ex.: Enterprise). Sem cobranca automatica." error={errors.priceMonthly?.message} {...register("priceMonthly")} />
            <TextInput label="Limite de usuarios (opcional)" type="number" hint="Vazio = sem limite." error={errors.maxUsers?.message} {...register("maxUsers")} />
            <TextInput label="Limite de ativos (opcional)" type="number" hint="Vazio = sem limite." error={errors.maxInstruments?.message} {...register("maxInstruments")} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-graphite-400">Recursos em destaque (opcional)</p>
              <button type="button" className="btn-ghost btn-sm" onClick={() => append({ value: "" })}>
                <Plus className="h-4 w-4" /> Item
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <TextInput className="flex-1" placeholder={`Ex.: Suporte prioritario`} error={errors.features?.[index]?.value?.message} {...register(`features.${index}.value`)} />
                  <button type="button" onClick={() => remove(index)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover item">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {fields.length === 0 && <p className="text-sm text-graphite-500">Nenhum item.</p>}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
