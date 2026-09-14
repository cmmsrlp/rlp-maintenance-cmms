import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, PlayCircle } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  listMaintenancePlanTemplates,
  createMaintenancePlanTemplate,
  updateMaintenancePlanTemplate,
  deleteMaintenancePlanTemplate,
  applyMaintenancePlanTemplate,
} from "../../../api/maintenancePlanTemplates";
import { listMeters } from "../../../api/meters";
import type { MaintenancePlanTemplate } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { TextInput, TextareaInput, SelectInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { UserPicker } from "../../../components/UserPicker";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";

const templateSchema = z.object({
  clientId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(2, "Informe o nome do modelo."),
  applicableAssetFamily: z.string().optional(),
  triggerType: z.enum(["TIME", "METER", "CONDITION"]),
  frequencyDays: z.coerce.number().int().positive().optional(),
  meterInterval: z.coerce.number().positive().optional(),
  toleranceDaysBefore: z.coerce.number().int().nonnegative().optional(),
  toleranceDaysAfter: z.coerce.number().int().nonnegative().optional(),
  procedure: z.string().optional(),
  estimatedLaborHours: z.coerce.number().nonnegative().optional(),
  checklistItems: z.array(z.object({ description: z.string().min(1, "Descreva o item.") })),
});
type TemplateFormValues = z.infer<typeof templateSchema>;

const applySchema = z.object({
  clientId: z.string().uuid().optional().or(z.literal("")),
  instrumentId: z.string().uuid("Selecione o ativo."),
  meterId: z.string().uuid().optional().or(z.literal("")),
  responsibleId: z.string().uuid().optional().or(z.literal("")),
});
type ApplyFormValues = z.infer<typeof applySchema>;

/** Modelos reutilizaveis de plano de manutencao por familia de ativo (catalogo global
 * RLP Maintenance + por cliente, igual codigo de falha) - "Aplicar" instancia um plano real
 * pra um ativo especifico, copiando periodicidade/tolerancia/HH/checklist. */
export default function MaintenancePlanTemplatesList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { canManage, isClient, ownClientId, base } = useCmms();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenancePlanTemplate | null>(null);
  const [applying, setApplying] = useState<MaintenancePlanTemplate | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["maintenance-plan-templates"], queryFn: () => listMaintenancePlanTemplates() });

  const {
    register,
    control,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({ resolver: zodResolver(templateSchema) });
  const { fields, append, remove } = useFieldArray({ control, name: "checklistItems" });
  // Periodicidade e intervalo do medidor sao mutuamente exclusivos (o backend so exige o do
  // tipo de disparo escolhido), mas os dois campos ficavam sempre visiveis - quem preenchia
  // o modelo via o campo do outro disparo junto e nao sabia se precisava dele tambem
  // (achado em auditoria: "campo irrelevante exigido"). Mostrar so o que se aplica.
  const templateTriggerType = watch("triggerType");

  function canEdit(t: MaintenancePlanTemplate) {
    if (!canManage) return false;
    return isClient ? t.clientId === ownClientId : true;
  }

  function openCreate() {
    reset({
      clientId: isClient ? (ownClientId ?? "") : "",
      name: "",
      applicableAssetFamily: "",
      triggerType: "TIME",
      procedure: "",
      checklistItems: [{ description: "" }],
    });
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(t: MaintenancePlanTemplate) {
    reset({
      clientId: t.clientId ?? "",
      name: t.name,
      applicableAssetFamily: t.applicableAssetFamily ?? "",
      triggerType: t.triggerType,
      frequencyDays: t.frequencyDays ?? undefined,
      meterInterval: t.meterInterval ?? undefined,
      toleranceDaysBefore: t.toleranceDaysBefore ?? undefined,
      toleranceDaysAfter: t.toleranceDaysAfter ?? undefined,
      procedure: t.procedure ?? "",
      estimatedLaborHours: t.estimatedLaborHours ?? undefined,
      checklistItems: t.checklistItems.length ? t.checklistItems : [{ description: "" }],
    });
    setEditing(t);
    setFormOpen(true);
  }

  async function onSubmit(values: TemplateFormValues) {
    const payload = {
      ...values,
      clientId: values.clientId || null,
      checklistItems: values.checklistItems.filter((c) => c.description.trim()),
    };
    try {
      if (editing) {
        await updateMaintenancePlanTemplate(editing.id, payload);
        notify("success", "Modelo atualizado.");
      } else {
        await createMaintenancePlanTemplate(payload);
        notify("success", "Modelo criado.");
      }
      setFormOpen(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["maintenance-plan-templates"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function toggleActive(t: MaintenancePlanTemplate) {
    if (!canEdit(t)) return;
    try {
      await updateMaintenancePlanTemplate(t.id, { active: !t.active });
      queryClient.invalidateQueries({ queryKey: ["maintenance-plan-templates"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleDelete(t: MaintenancePlanTemplate) {
    try {
      await deleteMaintenancePlanTemplate(t.id);
      notify("success", "Modelo removido.");
      queryClient.invalidateQueries({ queryKey: ["maintenance-plan-templates"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Modelos de plano de manutenção"
        description="Planos reutilizáveis por família de ativo - aplique num ativo para gerar um plano de verdade"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Modelos de plano" }]}
        actions={
          canManage && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Novo modelo
            </button>
          )
        }
      />

      <DataTable
        loading={isLoading}
        rows={data ?? []}
        keyField={(t) => t.id}
        emptyTitle="Nenhum modelo de plano cadastrado"
        columns={[
          { header: "Modelo", accessor: (t) => <span className="font-medium text-navy-900">{t.name}</span> },
          { header: "Família de ativo", accessor: (t) => t.applicableAssetFamily ?? "-" },
          { header: "Disparo", accessor: (t) => (t.triggerType === "TIME" ? `A cada ${t.frequencyDays ?? "-"} dias` : `Medidor: a cada ${t.meterInterval ?? "-"}`) },
          { header: "HH prevista", accessor: (t) => (t.estimatedLaborHours != null ? `${t.estimatedLaborHours}h` : "-") },
          { header: "Origem", accessor: (t) => <span className="text-xs text-graphite-500">{t.clientId ? "Meu catálogo" : "Padrão RLP Maintenance"}</span> },
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
            accessor: (t) => (
              <div className="flex items-center gap-2">
                {canManage && t.active && (
                  <button onClick={() => setApplying(t)} className="text-graphite-400 hover:text-navy-700" aria-label="Aplicar modelo a um ativo">
                    <PlayCircle className="h-4 w-4" />
                  </button>
                )}
                {canEdit(t) && (
                  <>
                    <button onClick={() => openEdit(t)} className="text-graphite-400 hover:text-navy-700" aria-label="Editar modelo">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(t)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover modelo">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Editar modelo de plano" : "Novo modelo de plano"}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" form="plan-template-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="plan-template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {!isClient && <ClientPicker label="Cliente (vazio = catálogo padrão RLP Maintenance)" {...register("clientId")} />}
            <TextInput label="Nome do modelo" required placeholder="Ex.: Lubrificação trimestral - motores elétricos" error={errors.name?.message} {...register("name")} />
          </div>
          <TextInput label="Família de ativo aplicável (opcional)" placeholder="Ex.: Motores elétricos, Bombas centrífugas" {...register("applicableAssetFamily")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Tipo de disparo"
              required
              options={[
                { value: "TIME", label: "Por tempo (periodicidade em dias)" },
                { value: "METER", label: "Por medidor" },
              ]}
              {...register("triggerType")}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {templateTriggerType === "METER" ? (
              <TextInput label="Intervalo do medidor" required type="number" step="any" hint="Para disparo por medidor." error={errors.meterInterval?.message} {...register("meterInterval")} />
            ) : (
              <TextInput label="Periodicidade (dias)" required type="number" hint="Para disparo por tempo." error={errors.frequencyDays?.message} {...register("frequencyDays")} />
            )}
            <TextInput label="HH prevista (opcional)" type="number" step="any" error={errors.estimatedLaborHours?.message} {...register("estimatedLaborHours")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Tolerância antes (dias, opcional)" type="number" error={errors.toleranceDaysBefore?.message} {...register("toleranceDaysBefore")} />
            <TextInput label="Tolerância depois (dias, opcional)" type="number" error={errors.toleranceDaysAfter?.message} {...register("toleranceDaysAfter")} />
          </div>
          <TextareaInput label="Procedimento padrão (opcional)" rows={3} {...register("procedure")} />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-graphite-400">Checklist padrao</p>
              <button type="button" className="btn-ghost btn-sm" onClick={() => append({ description: "" })}>
                <Plus className="h-4 w-4" /> Item
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((field, index) => (
                <div key={field.id} className="flex items-center gap-2">
                  <TextInput className="flex-1" placeholder={`Item ${index + 1}`} error={errors.checklistItems?.[index]?.description?.message} {...register(`checklistItems.${index}.description`)} />
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(index)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {applying && (
        <ApplyTemplateModal
          template={applying}
          onClose={() => setApplying(null)}
          onApplied={(planId) => {
            setApplying(null);
            navigate(`${base}/planos/${planId}`);
          }}
        />
      )}
    </div>
  );
}

function ApplyTemplateModal({
  template,
  onClose,
  onApplied,
}: {
  template: MaintenancePlanTemplate;
  onClose: () => void;
  onApplied: (planId: string) => void;
}) {
  const { notify } = useToast();
  const { isClient, ownClientId } = useCmms();
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ApplyFormValues>({ resolver: zodResolver(applySchema) });
  const clientId = watch("clientId");
  const instrumentId = watch("instrumentId");

  const { data: meters } = useQuery({
    queryKey: ["meters-picker", instrumentId],
    queryFn: () => listMeters({ instrumentId }),
    enabled: !!instrumentId && template.triggerType === "METER",
  });

  async function onSubmit(values: ApplyFormValues) {
    try {
      const plan = await applyMaintenancePlanTemplate(template.id, {
        instrumentId: values.instrumentId,
        meterId: values.meterId || null,
        responsibleId: values.responsibleId || null,
      });
      notify("success", `Plano "${plan.name}" criado a partir do modelo.`);
      onApplied(plan.id);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Aplicar modelo "${template.name}"`}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="apply-template-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Aplicando..." : "Aplicar"}
          </button>
        </>
      }
    >
      <form id="apply-template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <p className="text-sm text-graphite-500">
          Cria um plano de manutencao real para o ativo escolhido, copiando periodicidade, tolerancia, procedimento, HH prevista e checklist do modelo.
        </p>
        {!isClient && <ClientPicker required error={errors.clientId?.message} {...register("clientId")} />}
        <InstrumentPicker clientId={isClient ? ownClientId ?? undefined : clientId} required error={errors.instrumentId?.message} {...register("instrumentId")} />
        {template.triggerType === "METER" && (
          <SelectInput
            label="Medidor"
            required
            placeholder={instrumentId ? "Selecione o medidor" : "Selecione o ativo primeiro"}
            disabled={!instrumentId}
            options={(meters ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.unit}) - atual: ${m.currentValue}` }))}
            error={errors.meterId?.message}
            {...register("meterId")}
          />
        )}
        {!isClient && <UserPicker label="Responsável (opcional)" roles={["ADMIN", "TECHNICIAN"]} {...register("responsibleId")} />}
      </form>
    </Modal>
  );
}
