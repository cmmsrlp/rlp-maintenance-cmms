import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2 } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { TextInput, TextareaInput, SelectInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { UserPicker } from "../../../components/UserPicker";
import { getRootCauseAnalysis, createRootCauseAnalysis, updateRootCauseAnalysis, deleteRootCauseAnalysis } from "../../../api/rootCauseAnalyses";
import { getMaintenanceWorkOrder } from "../../../api/maintenanceWorkOrders";
import { RcaAttachments } from "../../../components/RcaAttachments";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { FullPageSpinner } from "../../../components/Spinner";
import { useCmms } from "../../../lib/cmms";

const schema = z.object({
  clientId: z.string().uuid("Selecione o cliente."),
  instrumentId: z.string().uuid().optional().or(z.literal("")),
  workOrderId: z.string().uuid().optional().or(z.literal("")),
  problem: z.string().min(2, "Descreva o problema."),
  participants: z.string().optional(),
  why1: z.string().optional(),
  why2: z.string().optional(),
  why3: z.string().optional(),
  why4: z.string().optional(),
  why5: z.string().optional(),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  preventiveActions: z.string().optional(),
  responsibleId: z.string().uuid().optional().or(z.literal("")),
  dueDate: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "CLOSED"]),
  effectivenessVerifiedAt: z.string().optional(),
  effectivenessNotes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const ROTULO_DO_CAMPO: Partial<Record<keyof FormValues, string>> = {
  clientId: "Cliente",
  problem: "Problema",
};

/** RCA / 5 Porques: falha critica ou recorrente dispara a analise -> plano de acao ->
 * execucao -> verificacao de eficacia -> encerramento. Uma pagina so, editavel a
 * qualquer momento (e' um documento vivo, nao algo que se preenche de uma vez). */
export default function RcaForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const isEdit = !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ["rca", id],
    queryFn: () => getRootCauseAnalysis(id!),
    enabled: isEdit,
  });

  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: ownClientId ?? searchParams.get("clientId") ?? "",
      instrumentId: searchParams.get("instrumentId") ?? "",
      workOrderId: searchParams.get("workOrderId") ?? "",
      status: "OPEN",
    },
  });
  const clientId = watch("clientId");

  // Mesmo motivo do formulario de OS: ownClientId chega assincrono, e o campo aqui e' um
  // <input hidden> sem erro visivel do lado.
  useEffect(() => {
    if (isClient && ownClientId && !isEdit) setValue("clientId", ownClientId);
  }, [isClient, ownClientId, isEdit, setValue]);

  useEffect(() => {
    if (existing) {
      reset({
        clientId: existing.clientId,
        instrumentId: existing.instrumentId ?? "",
        workOrderId: existing.workOrderId ?? "",
        problem: existing.problem,
        participants: existing.participants ?? "",
        why1: existing.why1 ?? "",
        why2: existing.why2 ?? "",
        why3: existing.why3 ?? "",
        why4: existing.why4 ?? "",
        why5: existing.why5 ?? "",
        rootCause: existing.rootCause ?? "",
        correctiveActions: existing.correctiveActions ?? "",
        preventiveActions: existing.preventiveActions ?? "",
        responsibleId: existing.responsibleId ?? "",
        dueDate: existing.dueDate?.slice(0, 10) ?? "",
        status: existing.status,
        effectivenessVerifiedAt: existing.effectivenessVerifiedAt?.slice(0, 10) ?? "",
        effectivenessNotes: existing.effectivenessNotes ?? "",
      });
    }
  }, [existing, reset]);

  // Aberta a partir de uma OS corretiva: o problema, o ativo e a causa apurada no
  // atendimento ja vem preenchidos - a RCA comeca de onde o tecnico parou, em vez de
  // pedir que alguem redigite o que ja esta na OS.
  const origemId = searchParams.get("workOrderId");
  const { data: origem } = useQuery({
    queryKey: ["rca-origem-os", origemId],
    queryFn: () => getMaintenanceWorkOrder(origemId as string),
    enabled: !isEdit && !!origemId,
  });
  useEffect(() => {
    if (!origem) return;
    setValue("clientId", origem.clientId);
    setValue("instrumentId", origem.instrumentId);
    setValue("problem", `OS ${origem.number} - ${origem.title ?? origem.description}`);
    if (origem.failureRootCause) setValue("why1", origem.failureRootCause);
  }, [origem, setValue]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        instrumentId: values.instrumentId || null,
        workOrderId: values.workOrderId || null,
        responsibleId: values.responsibleId || null,
        dueDate: values.dueDate || null,
        effectivenessVerifiedAt: values.effectivenessVerifiedAt || null,
      };
      const saved = isEdit ? await updateRootCauseAnalysis(id!, payload) : await createRootCauseAnalysis(payload);
      notify("success", isEdit ? "RCA atualizada." : "RCA aberta.");
      if (!isEdit) navigate(`${base}/rca/${saved.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  function onInvalid(erros: FieldErrors<FormValues>) {
    const campos = Object.keys(erros)
      .map((campo) => ROTULO_DO_CAMPO[campo as keyof FormValues] ?? campo)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    notify("error", campos.length ? `Falta preencher: ${campos.join(", ")}.` : "Ha campos obrigatorios nao preenchidos.");
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await deleteRootCauseAnalysis(id);
      notify("success", "RCA removida.");
      navigate(`${base}/rca`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  if (isEdit && isLoading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title={isEdit ? `RCA: ${existing?.problem ?? ""}` : "Nova analise de causa raiz (RCA)"}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "RCA / 5 Porques", to: `${base}/rca` },
          { label: isEdit ? "Editar" : "Nova" },
        ]}
        actions={
          isEdit && (
            <button className="btn-danger" onClick={handleDelete}>
              <Trash2 className="h-4 w-4" /> Remover
            </button>
          )
        }
      />

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Identificacao</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {isClient ? (
              <div>
                <input type="hidden" {...register("clientId")} />
                {errors.clientId && <p className="text-xs text-safety-red">{errors.clientId.message}</p>}
              </div>
            ) : (
              <ClientPicker required error={errors.clientId?.message} {...register("clientId")} />
            )}
            <InstrumentPicker label="Ativo (opcional)" clientId={clientId} error={errors.instrumentId?.message} {...register("instrumentId")} />
          </div>
          <TextareaInput label="Problema" required rows={2} error={errors.problem?.message} {...register("problem")} />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Participantes (opcional)" placeholder="Nomes, separados por virgula" {...register("participants")} />
            <UserPicker label="Responsavel (opcional)" roles={["ADMIN", "TECHNICIAN"]} {...register("responsibleId")} />
            <TextInput label="Prazo (opcional)" type="date" {...register("dueDate")} />
          </div>
          <SelectInput
            label="Status"
            options={[
              { value: "OPEN", label: "Aberta" },
              { value: "IN_PROGRESS", label: "Em andamento" },
              { value: "CLOSED", label: "Encerrada" },
            ]}
            {...register("status")}
          />
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">5 Porques</h2>
          <TextInput label="1. Por que aconteceu?" {...register("why1")} />
          <TextInput label="2. Por que?" {...register("why2")} />
          <TextInput label="3. Por que?" {...register("why3")} />
          <TextInput label="4. Por que?" {...register("why4")} />
          <TextInput label="5. Por que?" {...register("why5")} />
          <TextareaInput label="Causa raiz" rows={2} {...register("rootCause")} />
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Plano de acao</h2>
          <TextareaInput label="Acoes corretivas" rows={2} {...register("correctiveActions")} />
          <TextareaInput label="Acoes preventivas" rows={2} {...register("preventiveActions")} />
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Verificacao de eficacia</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Verificada em (opcional)" type="date" {...register("effectivenessVerifiedAt")} />
          </div>
          <TextareaInput label="Observacoes da verificacao" rows={2} {...register("effectivenessNotes")} />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>

      {isEdit && (
        <div className="mt-6">
          <RcaAttachments rcaId={id!} canEdit />
        </div>
      )}
    </div>
  );
}
