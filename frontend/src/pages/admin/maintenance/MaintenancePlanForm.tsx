import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import type { FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { Plus, Trash2, Check, X } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { TextInput, TextareaInput, SelectInput, CheckboxInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { SparePartPicker } from "../../../components/SparePartPicker";
import { UserPicker } from "../../../components/UserPicker";
import { EntityAttachments } from "../../../components/EntityAttachments";
import { listMeters } from "../../../api/meters";
import {
  createMaintenancePlan,
  getMaintenancePlan,
  updateMaintenancePlan,
  atribuirAtivosAoPlano,
  listMaintenancePlanAttachments,
  uploadMaintenancePlanAttachment,
  deleteMaintenancePlanAttachment,
  getMaintenancePlanAttachmentUrl,
} from "../../../api/maintenancePlans";
import { listLaborTypes } from "../../../api/laborTypes";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { FullPageSpinner } from "../../../components/Spinner";
import { useCmms } from "../../../lib/cmms";
import { TIPOS_DE_PLANO } from "../../../lib/maintenanceLabels";
import { listLubricationRoutes } from "../../../api/lubrication";

const MESES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Critica" };

const schema = z.object({
  clientId: z.string().uuid("Selecione o cliente."),
  // Nao existe no cadastro - so aparece na edicao, para o plano que ja tem um ativo. A
  // atribuicao (um ou varios ativos) e' feita depois de salvar, na ficha do plano.
  instrumentId: z.string().uuid().optional().or(z.literal("")),
  name: z.string().min(2, "Informe o nome do plano."),
  description: z.string().optional(),
  triggerType: z.enum(["TIME", "METER", "CONDITION"]),
  frequencyDays: numeroOpcional(z.coerce.number().int().positive()),
  meterId: z.string().uuid().optional().or(z.literal("")),
  meterInterval: numeroOpcional(z.coerce.number().positive()),
  // Agendamento
  frequencyUnit: z.enum(["DAY", "WEEK", "MONTH", "YEAR"]),
  frequencyEvery: numeroOpcional(z.coerce.number().int().positive()),
  baseDate: z.string().optional(),
  dayOfWeek: numeroOpcional(z.coerce.number().int().min(0).max(6)),
  dayOfMonth: numeroOpcional(z.coerce.number().int().min(1).max(31)),
  monthOfYear: numeroOpcional(z.coerce.number().int().min(1).max(12)),
  operationalCalendar: z.enum(["ALL_DAYS", "BUSINESS_DAYS"]),
  generateAdvanceDays: numeroOpcional(z.coerce.number().int().nonnegative()),
  meterBaseReading: numeroOpcional(z.coerce.number()),
  generateAdvanceMeterUnits: numeroOpcional(z.coerce.number().nonnegative()),
  toleranceMeterBefore: numeroOpcional(z.coerce.number().nonnegative()),
  toleranceMeterAfter: numeroOpcional(z.coerce.number().nonnegative()),
  meterResetRule: z.enum(["CONTINUE", "RESET_BASE"]),
  conditionMeterId: z.string().uuid().optional().or(z.literal("")),
  initialWorkOrderStatus: z.enum(["IN_TRIAGE", "PLANNED", "PROGRAMMED"]),
  requiresShutdown: z.boolean().optional(),
  estimatedShutdownHours: numeroOpcional(z.coerce.number().nonnegative()),
  requiresOperationalRelease: z.boolean().optional(),
  requiresLoto: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  groupWorkOrder: z.boolean().optional(),
  materialPolicy: z.enum(["RESERVE_AUTO", "BLOCK_AWAITING_MATERIAL", "ALERT_ONLY", "DO_NOT_GENERATE"]),
  responsibleId: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "ACTIVE", "SUSPENDED", "CLOSED"]),
  planType: z.enum(["PREVENTIVE", "PREDICTIVE", "INSPECTION", "LUBRICATION", "CALIBRATION", "ELECTRICAL", "MECHANICAL", "REGULATORY", "OTHER"]),
  // Plano de lubrificacao agenda uma rota; o lubrificante, a quantidade e o metodo sao
  // especificacao de cada ponto da rota.
  lubricationRouteId: z.string().uuid().optional().or(z.literal("")),
  scope: z.enum(["SINGLE_ASSET", "ASSET_FAMILY"]),
  defaultPriority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  specialtyId: z.string().uuid().optional().or(z.literal("")),
  // Item em branco e' normal: a lista nasce com uma linha vazia e o envio ja filtra as
  // vazias - exigir descricao aqui bloqueava salvar/avancar de etapa por causa da linha
  // que ninguem preencheu porque o plano nao tem checklist.
  checklistTemplate: z.array(
    z.object({
      description: z.string(),
      section: z.string().optional(),
      required: z.boolean().optional(),
      responseType: z.enum(["YES_NO_NA", "TEXT", "NUMBER", "PHOTO", "SIGNATURE"]).optional(),
      unit: z.string().optional(),
      minValue: numeroOpcional(z.coerce.number()),
      maxValue: numeroOpcional(z.coerce.number()),
      targetValue: numeroOpcional(z.coerce.number()),
      requiresPhoto: z.boolean().optional(),
      reference: z.string().optional(),
      estimatedMinutes: numeroOpcional(z.coerce.number().int().nonnegative()),
    }),
  ),
  toleranceDaysBefore: numeroOpcional(z.coerce.number().int().nonnegative()),
  toleranceDaysAfter: numeroOpcional(z.coerce.number().int().nonnegative()),
  procedure: z.string().optional(),
  estimatedLaborHours: numeroOpcional(z.coerce.number().nonnegative()),
  parts: z.array(
    z.object({
      sparePartId: z.string(),
      quantity: z.coerce.number().int().positive(),
      required: z.boolean().optional(),
      alternativeSparePartId: z.string().optional(),
      suggestedSupplier: z.string().optional(),
    }),
  ),
});
type FormValues = z.infer<typeof schema>;

const ROTULO_DO_CAMPO: Partial<Record<keyof FormValues, string>> = {
  clientId: "Cliente",
  name: "Nome do plano",
  planType: "Tipo de plano",
};

export default function MaintenancePlanForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const isEdit = !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ["maintenance-plan", id],
    queryFn: () => getMaintenancePlan(id!),
    enabled: isEdit,
  });

  const { register, control, handleSubmit, watch, reset, trigger, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: ownClientId ?? searchParams.get("clientId") ?? "",
      instrumentId: searchParams.get("instrumentId") ?? "",
      triggerType: "TIME",
      frequencyUnit: "DAY",
      operationalCalendar: "ALL_DAYS",
      meterResetRule: "CONTINUE",
      initialWorkOrderStatus: "PROGRAMMED",
      materialPolicy: "RESERVE_AUTO",
      status: "ACTIVE",
      // Vindo do aviso "criar plano de calibracao" na ficha do ativo, o tipo ja chega
      // escolhido - senao a pessoa clicaria no atalho e teria que adivinhar o tipo certo.
      planType: (searchParams.get("planType") as FormValues["planType"] | null) ?? "PREVENTIVE",
      scope: "SINGLE_ASSET",
      defaultPriority: "MEDIUM",
      checklistTemplate: [{ description: "", required: true, responseType: "YES_NO_NA" }],
      parts: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "checklistTemplate" });
  const { fields: partFields, append: appendPart, remove: removePart } = useFieldArray({ control, name: "parts" });
  const clientId = watch("clientId");
  const instrumentId = watch("instrumentId");
  const triggerType = watch("triggerType");
  const planType = watch("planType");
  const lubricationRouteId = watch("lubricationRouteId");

  // Mesmo motivo do formulario de OS: ownClientId chega assincrono, e o campo aqui e' um
  // <input hidden> sem erro visivel do lado - sem isso, o assistente ficava travado na
  // etapa 1 sem dizer por que.
  useEffect(() => {
    if (isClient && ownClientId && !isEdit) setValue("clientId", ownClientId);
  }, [isClient, ownClientId, isEdit, setValue]);

  const { data: rotasDeLubrificacao } = useQuery({
    queryKey: ["rotas-lubrificacao-plano", clientId],
    queryFn: () => listLubricationRoutes({ clientId, active: true }),
    enabled: !!clientId && planType === "LUBRICATION",
  });
  const rotaEscolhida = (rotasDeLubrificacao ?? []).find((r) => r.id === lubricationRouteId);
  const frequencyUnit = watch("frequencyUnit");

  const { data: meters } = useQuery({
    queryKey: ["meters-picker", instrumentId],
    queryFn: () => listMeters({ instrumentId }),
    enabled: !!instrumentId && (triggerType === "METER" || triggerType === "CONDITION"),
  });

  // Especialidade reaproveita o catalogo de tipos de mao de obra (Mecanica, Eletrica,
  // Instrumentacao...) em vez de criar mais uma lista solta de texto.
  const { data: specialties } = useQuery({
    queryKey: ["labor-types-picker"],
    queryFn: () => listLaborTypes({ active: true }),
    staleTime: 60_000,
  });

  // Assistente em 3 etapas: cada etapa so libera a proxima quando os campos dela estao
  // validos, para o usuario nao descobrir erro da etapa 1 ao clicar em salvar na 3.
  const [step, setStep] = useState(0);
  // So no cadastro: o plano ainda nao existe, entao o arquivo fica em memoria ate o
  // "Salvar plano" criar o id que o upload precisa. Na edicao a ficha ja gerencia varios
  // anexos direto (EntityAttachments), sem essa etapa intermediaria.
  const [anexoNovo, setAnexoNovo] = useState<File | null>(null);
  const STEP_FIELDS: (keyof FormValues)[][] = [
    ["clientId", "name", "planType", "scope", "defaultPriority", "status"],
    ["triggerType", "frequencyEvery", "frequencyUnit", "meterId", "meterInterval", "conditionMeterId", "toleranceDaysBefore", "toleranceDaysAfter"],
    ["estimatedLaborHours", "procedure", "parts", "checklistTemplate"],
  ];
  // O botao "Salvar plano" da etapa 3 ocupa o mesmo lugar na tela onde estava o "Continuar"
  // da etapa 2 - sem nada marcando visualmente a troca, um clique logo em seguida (ou um
  // duplo-clique na mesma posicao) podia acertar "Salvar" antes de a pessoa ver que a etapa
  // mudou, salvando o plano sem materiais nem checklist (achado em auditoria). Rolar de
  // volta ao topo do assistente a cada troca de etapa forca a pessoa a ver o conteudo novo
  // antes de poder clicar em qualquer botao daquela etapa.
  const topoDoAssistenteRef = useRef<HTMLDivElement>(null);
  // Trava curta logo apos qualquer troca de etapa: um clique duplo (ou um clique repetido
  // rapido demais, humano ou de automacao de teste) podia acertar duas vezes o mesmo lugar
  // da tela - a segunda vez cai exatamente onde o botao "Salvar plano" acabou de aparecer no
  // lugar do "Continuar" da ultima etapa, salvando o plano sem querer (achado em
  // reavaliacao). Ignorar cliques nos botoes de navegacao por um instante apos cada troca
  // fecha essa janela, complementando o scroll ao topo que ja existia.
  const [trocandoDeEtapa, setTrocandoDeEtapa] = useState(false);

  async function goToStep(next: number) {
    if (trocandoDeEtapa) return;
    if (next > step) {
      const ok = await trigger(STEP_FIELDS[step]);
      if (!ok) {
        // trigger() so' atualiza o estado interno do RHF - "errors" aqui ainda e' o
        // instantaneo de antes da validacao rodar, entao a mensagem fica generica (o
        // campo em si, quando tem onde aparecer, ja mostra o motivo especifico do lado).
        notify("error", "Preencha os campos obrigatorios desta etapa antes de avancar.");
        return;
      }
    }
    setStep(next);
    setTrocandoDeEtapa(true);
    setTimeout(() => setTrocandoDeEtapa(false), 400);
    topoDoAssistenteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    if (existing) {
      reset({
        clientId: existing.clientId,
        instrumentId: existing.instrumentId ?? "",
        name: existing.name,
        description: existing.description ?? "",
        triggerType: existing.triggerType,
        frequencyDays: existing.frequencyDays ?? undefined,
        meterId: existing.meterId ?? "",
        meterInterval: existing.meterInterval ?? undefined,
        responsibleId: existing.responsibleId ?? "",
        status: existing.status ?? (existing.active ? "ACTIVE" : "SUSPENDED"),
        planType: existing.planType ?? "PREVENTIVE",
        lubricationRouteId: existing.lubricationRouteId ?? "",
        scope: existing.scope ?? "SINGLE_ASSET",
        defaultPriority: existing.defaultPriority ?? "MEDIUM",
        specialtyId: existing.specialtyId ?? "",
        frequencyUnit: existing.frequencyUnit ?? "DAY",
        frequencyEvery: existing.frequencyEvery ?? existing.frequencyDays ?? undefined,
        baseDate: existing.baseDate?.slice(0, 10) ?? "",
        dayOfWeek: existing.dayOfWeek ?? undefined,
        dayOfMonth: existing.dayOfMonth ?? undefined,
        monthOfYear: existing.monthOfYear ?? undefined,
        operationalCalendar: existing.operationalCalendar ?? "ALL_DAYS",
        generateAdvanceDays: existing.generateAdvanceDays ?? undefined,
        meterBaseReading: existing.meterBaseReading ?? undefined,
        generateAdvanceMeterUnits: existing.generateAdvanceMeterUnits ?? undefined,
        toleranceMeterBefore: existing.toleranceMeterBefore ?? undefined,
        toleranceMeterAfter: existing.toleranceMeterAfter ?? undefined,
        meterResetRule: existing.meterResetRule ?? "CONTINUE",
        conditionMeterId: existing.conditionMeterId ?? "",
        initialWorkOrderStatus: (existing.initialWorkOrderStatus ?? "PROGRAMMED") as "IN_TRIAGE" | "PLANNED" | "PROGRAMMED",
        requiresShutdown: existing.requiresShutdown ?? false,
        estimatedShutdownHours: existing.estimatedShutdownHours ?? undefined,
        requiresOperationalRelease: existing.requiresOperationalRelease ?? false,
        requiresLoto: existing.requiresLoto ?? false,
        requiresApproval: existing.requiresApproval ?? false,
        groupWorkOrder: existing.groupWorkOrder ?? false,
        materialPolicy: existing.materialPolicy ?? "RESERVE_AUTO",
        checklistTemplate: existing.checklistTemplate.length
          ? existing.checklistTemplate.map((c) => ({
              description: c.description,
              section: c.section ?? "",
              estimatedMinutes: c.estimatedMinutes ?? undefined,
              required: c.required ?? true,
              responseType: c.responseType ?? "YES_NO_NA",
              unit: c.unit ?? "",
              minValue: c.minValue ?? undefined,
              maxValue: c.maxValue ?? undefined,
              targetValue: c.targetValue ?? undefined,
              requiresPhoto: c.requiresPhoto ?? false,
              reference: c.reference ?? "",
            }))
          : [{ description: "", required: true, responseType: "YES_NO_NA" as const }],
        toleranceDaysBefore: existing.toleranceDaysBefore ?? undefined,
        toleranceDaysAfter: existing.toleranceDaysAfter ?? undefined,
        procedure: existing.procedure ?? "",
        estimatedLaborHours: existing.estimatedLaborHours ?? undefined,
        parts: (existing.parts ?? []).map((p) => ({
          sparePartId: p.sparePartId,
          quantity: p.quantity,
          required: p.required ?? true,
          alternativeSparePartId: p.alternativeSparePartId ?? "",
          suggestedSupplier: p.suggestedSupplier ?? "",
        })),
      });
    }
  }, [existing, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        meterId: values.meterId || null,
        responsibleId: values.responsibleId || null,
        specialtyId: values.specialtyId || null,
        conditionMeterId: values.conditionMeterId || null,
        baseDate: values.baseDate || null,
        dayOfWeek: values.dayOfWeek ?? null,
        dayOfMonth: values.dayOfMonth ?? null,
        monthOfYear: values.monthOfYear ?? null,
        generateAdvanceDays: values.generateAdvanceDays ?? null,
        meterBaseReading: values.meterBaseReading ?? null,
        generateAdvanceMeterUnits: values.generateAdvanceMeterUnits ?? null,
        toleranceMeterBefore: values.toleranceMeterBefore ?? null,
        toleranceMeterAfter: values.toleranceMeterAfter ?? null,
        checklistTemplate: values.checklistTemplate
          .filter((c) => c.description.trim())
          .map((c) => ({
            ...c,
            section: c.section || null,
            unit: c.unit || null,
            reference: c.reference || null,
            estimatedMinutes: c.estimatedMinutes ?? null,
          })),
        toleranceDaysBefore: values.toleranceDaysBefore ?? null,
        toleranceDaysAfter: values.toleranceDaysAfter ?? null,
        procedure: values.procedure || null,
        // Lubrificacao so viaja em plano de lubrificacao - noutro tipo o backend recusa.
        lubricationRouteId: values.planType === "LUBRICATION" ? values.lubricationRouteId || null : null,
        estimatedLaborHours: values.estimatedLaborHours ?? null,
        parts: values.parts
          .filter((p) => p.sparePartId)
          .map((p) => ({ ...p, alternativeSparePartId: p.alternativeSparePartId || null, suggestedSupplier: p.suggestedSupplier || null })),
      };
      // No cadastro nao ha campo de ativo - o plano nasce sem, e "instrumentId" nem viaja no
      // corpo (uma string vazia nao passaria na validacao de uuid). Na edicao a ficha ainda
      // mostra o campo (se o plano ja tiver um ativo), entao o valor e' preservado.
      const { instrumentId: instrumentIdDoFormulario, ...payloadSemAtivo } = payload;
      const payloadFinal = isEdit ? { ...payloadSemAtivo, instrumentId: instrumentIdDoFormulario || null } : payloadSemAtivo;
      const saved = isEdit ? await updateMaintenancePlan(id!, payloadFinal) : await createMaintenancePlan(payloadFinal);

      // Veio do atalho "Novo plano" na ficha de um ativo: o formulario nao pergunta o
      // ativo, mas a intencao de "e' para este ativo" nao pode se perder - atribui na
      // hora, como se fosse o primeiro passo da atribuicao feita logo em seguida.
      const ativoDoAtalho = !isEdit ? searchParams.get("instrumentId") : null;
      if (ativoDoAtalho) {
        await atribuirAtivosAoPlano(saved.id, [ativoDoAtalho]);
      }

      // Mesmo raciocinio do ativo: o arquivo so podia subir depois que o plano ganhou id.
      if (!isEdit && anexoNovo) {
        await uploadMaintenancePlanAttachment(saved.id, anexoNovo, anexoNovo.type.startsWith("image/") ? "OTHER" : "DOCUMENT");
      }

      notify("success", isEdit ? "Plano atualizado." : "Plano criado.");
      navigate(`${base}/planos/${saved.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  /** No envio final o RHF entrega os erros atualizados como parametro (diferente do
   * trigger() acima) - da para nomear exatamente o que falta, incluindo o Cliente, que
   * no portal e' um <input hidden> sem onde mostrar o proprio erro do lado. */
  function onInvalid(erros: FieldErrors<FormValues>) {
    const campos = Object.keys(erros)
      .map((campo) => ROTULO_DO_CAMPO[campo as keyof FormValues] ?? campo)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    notify("error", campos.length ? `Falta preencher: ${campos.join(", ")}.` : "Há campos obrigatórios não preenchidos.");
  }

  if (isEdit && isLoading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title={isEdit ? "Editar plano de manutenção" : "Novo plano de manutenção"}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Planos", to: `${base}/planos` },
          { label: isEdit ? "Editar" : "Novo" },
        ]}
      />
      {/* Assistente em 3 etapas: nem todo campo de uma vez. */}
      <div ref={topoDoAssistenteRef} className="mb-6 flex flex-wrap items-center gap-2">
        {["Identificação", "Disparo e geração da OS", "Execução, materiais e checklist"].map((label, index) => {
          const done = index < step;
          const current = index === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => goToStep(index)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                current
                  ? "border-navy-700 bg-navy-700 text-white"
                  : done
                    ? "border-navy-200 bg-navy-50 text-navy-700"
                    : "border-gray-200 bg-white text-graphite-500"
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                current ? "bg-white text-navy-700" : done ? "bg-navy-700 text-white" : "bg-gray-100 text-graphite-500"
              }`}>
                {done ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
        <div className={step === 0 ? "space-y-6" : "hidden"}>
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
            {isEdit && (
              <InstrumentPicker
                clientId={clientId}
                hint="Pode trocar ou limpar aqui - a atribuição em massa continua na ficha do plano."
                error={errors.instrumentId?.message}
                {...register("instrumentId")}
              />
            )}
          </div>
          <TextInput label="Nome do plano" required placeholder="Ex.: Manutenção preventiva mensal" hint="Descreva do que se trata - é o que identifica o plano no dia a dia." error={errors.name?.message} {...register("name")} />
          <TextareaInput label="Descrição (opcional)" rows={2} {...register("description")} />

          {/* Dados que o plano carrega mas nao se digita: codigo, origem e a criticidade
              do proprio ativo. So leitura, para nao virar informacao repetida. Sempre
              visivel (nao so com ativo escolhido): o codigo e' o que identifica o plano
              quando nao ha ativo nenhum. */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-graphite-400">Dados do plano</p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-graphite-400">Código</dt>
                <dd className="font-medium text-graphite-800">{existing?.code ?? "Gerado ao salvar (PM-0001)"}</dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-400">Origem</dt>
                <dd className="font-medium text-graphite-800">
                  {existing?.template ? `Modelo: ${existing.template.name}` : "Plano próprio"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-400">Ativo</dt>
                <dd className="font-medium text-graphite-800">
                  {!isEdit
                    ? "Escolhido depois de salvar, na ficha do plano"
                    : !instrumentId
                      ? "Sem ativo vinculado"
                      : existing?.instrument?.criticality
                        ? `Criticidade ${PRIORITY_LABELS[existing.instrument.criticality]}`
                        : "Definida no cadastro do ativo"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectInput
              label="Tipo de plano"
              required
              options={Object.entries(TIPOS_DE_PLANO).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
              {...register("planType")}
            />
            <SelectInput
              label="Status"
              required
              hint="Só plano Ativo gera OS."
              options={[
                { value: "DRAFT", label: "Rascunho" },
                { value: "ACTIVE", label: "Ativo" },
                { value: "SUSPENDED", label: "Suspenso" },
                { value: "CLOSED", label: "Encerrado" },
              ]}
              {...register("status")}
            />
            <SelectInput
              label="Prioridade da OS gerada"
              required
              options={[
                { value: "LOW", label: "Baixa" },
                { value: "MEDIUM", label: "Média" },
                { value: "HIGH", label: "Alta" },
                { value: "CRITICAL", label: "Crítica" },
              ]}
              {...register("defaultPriority")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Aplicação"
              required
              hint="Família sinaliza um plano que serve vários ativos do mesmo tipo."
              options={[
                { value: "SINGLE_ASSET", label: "Ativo individual" },
                { value: "ASSET_FAMILY", label: "Família de ativos" },
              ]}
              {...register("scope")}
            />
            <SelectInput
              label="Especialidade sugerida (opcional)"
              placeholder="Nenhuma"
              hint="Vem do catálogo de tipos de mão de obra."
              options={(specialties ?? []).map((t) => ({ value: t.id, label: t.name }))}
              {...register("specialtyId")}
            />
          </div>

          {!isEdit && (
            <p className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-graphite-500">
              O ativo (um ou vários) é escolhido depois de salvar, na ficha do plano - "Família de ativos" só
              sinaliza que este plano serve vários ativos do mesmo tipo.
            </p>
          )}

          {!isClient && (
            <UserPicker label="Responsável pelo plano" roles={["ADMIN", "TECHNICIAN"]} error={errors.responsibleId?.message} {...register("responsibleId")} />
          )}
        </div>
        </div>

        <div className={step === 1 ? "space-y-6" : "hidden"}>
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Disparo da manutenção</h2>
          <SelectInput
            label="Tipo de disparo"
            required
            options={[
              { value: "TIME", label: "Por tempo / calendário" },
              { value: "METER", label: "Por medidor, ciclo ou contador" },
              { value: "CONDITION", label: "Por condição (preditiva)" },
            ]}
            {...register("triggerType")}
          />

          {triggerType === "TIME" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput
                  label="A cada"
                  type="number"
                  required
                  placeholder="Ex.: 3"
                  error={errors.frequencyEvery?.message}
                  {...register("frequencyEvery")}
                />
                <SelectInput
                  label="Unidade"
                  required
                  options={[
                    { value: "DAY", label: "Dia(s)" },
                    { value: "WEEK", label: "Semana(s)" },
                    { value: "MONTH", label: "Mês(es)" },
                    { value: "YEAR", label: "Ano(s)" },
                  ]}
                  {...register("frequencyUnit")}
                />
              </div>

              <TextInput
                label="Data-base do ciclo"
                type="date"
                hint="De onde a contagem parte. Em branco, começa hoje."
                {...register("baseDate")}
              />

              {/* Ancoragem no calendario: so aparece quando a unidade pede. */}
              {frequencyUnit === "WEEK" && (
                <SelectInput
                  label="Dia da semana"
                  placeholder="Qualquer dia"
                  options={[
                    { value: "1", label: "Segunda" },
                    { value: "2", label: "Terça" },
                    { value: "3", label: "Quarta" },
                    { value: "4", label: "Quinta" },
                    { value: "5", label: "Sexta" },
                    { value: "6", label: "Sábado" },
                    { value: "0", label: "Domingo" },
                  ]}
                  {...register("dayOfWeek")}
                />
              )}
              {(frequencyUnit === "MONTH" || frequencyUnit === "YEAR") && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextInput
                    label="Dia do mês"
                    type="number"
                    placeholder="Ex.: 15"
                    hint="Mês mais curto cai no último dia, não vira o mês."
                    {...register("dayOfMonth")}
                  />
                  {frequencyUnit === "YEAR" && (
                    <SelectInput
                      label="Mês do ano"
                      placeholder="Mesmo mês da data-base"
                      options={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
                      {...register("monthOfYear")}
                    />
                  )}
                </div>
              )}
            </>
          )}

          {triggerType === "METER" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectInput
                  label="Medidor"
                  required
                  hint="Horímetro, odômetro, ciclos, partidas, toneladas - a unidade vem do medidor."
                  placeholder={instrumentId ? "Selecione o medidor" : "Selecione o ativo primeiro"}
                  disabled={!instrumentId}
                  options={(meters ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.unit}) - atual: ${m.currentValue}` }))}
                  error={errors.meterId?.message}
                  {...register("meterId")}
                />
                <TextInput
                  label="Intervalo entre manutenções"
                  type="number"
                  step="any"
                  required
                  hint="Na unidade do medidor."
                  error={errors.meterInterval?.message}
                  {...register("meterInterval")}
                />
              </div>
              <TextInput
                label="Leitura-base"
                type="number"
                step="any"
                hint="Leitura em que o ciclo atual começou. Em branco, usa a leitura da última geração."
                {...register("meterBaseReading")}
              />
            </>
          )}

          {triggerType === "CONDITION" && (
            <SelectInput
              label="Ponto de medição"
              required
              hint="A OS nasce quando este ponto entra em alarme. Configure os limites em Ativos > Medidores."
              placeholder={instrumentId ? "Selecione o ponto" : "Selecione o ativo primeiro"}
              disabled={!instrumentId}
              options={(meters ?? []).map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
              error={errors.conditionMeterId?.message}
              {...register("conditionMeterId")}
            />
          )}
        </div>
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Configurações avançadas</h2>
          <p className="text-sm text-graphite-500">
            Valem para quem precisa apertar o controle. Em branco, o plano vence na data calculada e a OS
            nasce no próprio vencimento.
          </p>

          {triggerType === "TIME" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextInput
                  label="Gerar a OS com antecedência (dias)"
                  type="number"
                  hint="Dá tempo do PCM planejar antes de vencer."
                  error={errors.generateAdvanceDays?.message}
                  {...register("generateAdvanceDays")}
                />
                <TextInput
                  label="Janela para antecipar (dias)"
                  type="number"
                  hint="Pode executar até X dias antes do vencimento."
                  error={errors.toleranceDaysBefore?.message}
                  {...register("toleranceDaysBefore")}
                />
                <TextInput
                  label="Tolerância após vencer (dias)"
                  type="number"
                  hint="Ainda conta como no prazo até X dias depois."
                  error={errors.toleranceDaysAfter?.message}
                  {...register("toleranceDaysAfter")}
                />
              </div>
              <SelectInput
                label="Calendário operacional"
                hint="Em dias úteis, um vencimento que cair no fim de semana anda para a segunda."
                options={[
                  { value: "ALL_DAYS", label: "Todos os dias" },
                  { value: "BUSINESS_DAYS", label: "Somente dias úteis" },
                ]}
                {...register("operationalCalendar")}
              />
            </>
          )}

          {triggerType === "METER" && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextInput
                  label="Antecedência (unidades do medidor)"
                  type="number"
                  step="any"
                  hint="Abre a OS X unidades antes de vencer."
                  {...register("generateAdvanceMeterUnits")}
                />
                <TextInput
                  label="Tolerância antes (unidades)"
                  type="number"
                  step="any"
                  {...register("toleranceMeterBefore")}
                />
                <TextInput
                  label="Tolerância depois (unidades)"
                  type="number"
                  step="any"
                  {...register("toleranceMeterAfter")}
                />
              </div>
              <SelectInput
                label="Se o medidor for trocado ou zerado"
                hint="Define se a contagem continua de onde estava ou recomeça."
                options={[
                  { value: "CONTINUE", label: "Continuar somando (leitura acumulada do ativo)" },
                  { value: "RESET_BASE", label: "Recomeçar do zero na troca" },
                ]}
                {...register("meterResetRule")}
              />
            </>
          )}
        </div>

        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Como a OS nasce</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Status inicial da OS"
              required
              hint="Programada já entra no quadro com data; Planejada fica na fila do PCM."
              options={[
                { value: "IN_TRIAGE", label: "Em triagem" },
                { value: "PLANNED", label: "Planejada" },
                { value: "PROGRAMMED", label: "Programada" },
              ]}
              {...register("initialWorkOrderStatus")}
            />
            <TextInput
              label="Tempo estimado de parada (h)"
              type="number"
              step="any"
              hint="Só se a manutenção exigir máquina parada."
              {...register("estimatedShutdownHours")}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <CheckboxInput label="Requer parada de máquina" {...register("requiresShutdown")} />
            <CheckboxInput label="Requer liberação operacional" {...register("requiresOperationalRelease")} />
            <CheckboxInput label="Requer bloqueio/LOTO ou permissão de trabalho" {...register("requiresLoto")} />
            <CheckboxInput label="Requer aprovação antes de executar" {...register("requiresApproval")} />
            <CheckboxInput label="Gerar uma OS agrupada para vários ativos" {...register("groupWorkOrder")} />
          </div>

          <SelectInput
            label="Se faltar material na hora de gerar"
            required
            hint="Em qualquer opção o motivo da falta fica registrado na OS - nunca falha em silêncio."
            options={[
              { value: "RESERVE_AUTO", label: "Reservar o que houver e registrar o que faltou" },
              { value: "BLOCK_AWAITING_MATERIAL", label: "Gerar a OS já em Aguardando material" },
              { value: "ALERT_ONLY", label: "Gerar sem reservar, apenas alertar" },
              { value: "DO_NOT_GENERATE", label: "Não gerar a OS se faltar material obrigatório" },
            ]}
            {...register("materialPolicy")}
          />
        </div>
        </div>

        <div className={step === 2 ? "space-y-6" : "hidden"}>
        {/* Lubrificacao: so aparece no plano desse tipo. Um plano de lubrificacao sem dizer
            qual graxa, em quantos pontos e quanto em cada um nao e' um plano - e' um
            lembrete. */}
        {planType === "LUBRICATION" && (
          <div className="card space-y-4 p-5">
            <div>
              <h2 className="font-semibold text-navy-900">Rota de lubrificação</h2>
              <p className="text-xs text-graphite-500">
                O plano agenda uma rota; o lubrificante, a quantidade e o método são a especificação de cada
                ponto dela - cadastrados em Lubrificação &gt; Pontos.
              </p>
            </div>
            <SelectInput
              label="Rota"
              placeholder={clientId ? "Selecione a rota" : "Selecione o cliente primeiro"}
              disabled={!clientId}
              options={(rotasDeLubrificacao ?? []).map((r) => ({
                value: r.id,
                label: `${r.name}${r.items?.length ? ` (${r.items.length} pontos)` : ""}`,
              }))}
              {...register("lubricationRouteId")}
            />
            {rotaEscolhida && (
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-graphite-400">Pontos da rota</p>
                <ul className="mt-1 space-y-0.5 text-sm text-graphite-700">
                  {(rotaEscolhida.items ?? []).map((item) => (
                    <li key={item.id}>
                      {item.point.code} - {item.point.name}
                      <span className="text-graphite-400">
                        {" "}
                        ({item.point.quantityPerApplication} {item.point.lubricant?.sparePart.unit ?? ""} de{" "}
                        {item.point.lubricant?.sparePart.name ?? "lubrificante"}, a cada {item.point.frequencyDays} dias)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* estimatedLaborHours e procedure ja existiam no schema e eram validados/enviados
            nesta etapa, mas nunca tinham campo de formulario - o plano so' guardava HH
            prevista e procedimento se viessem de uma importacao, nunca pelo assistente
            (achado em auditoria: PM-0003 tinha estimatedShutdownHours mas nao HH prevista). */}
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Execução</h2>
          <TextInput
            label="HH prevista (horas)"
            type="number"
            step="any"
            hint="Total de horas de mão de obra estimadas para executar o plano - usado para comparar previsto x realizado."
            {...register("estimatedLaborHours")}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-graphite-700">Procedimento</label>
            <textarea
              className="input"
              rows={4}
              placeholder="Passo a passo da execução, ou referência ao documento anexado abaixo."
              {...register("procedure")}
            />
          </div>
        </div>

        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-navy-900">Materiais previstos</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => appendPart({ sparePartId: "", quantity: 1, required: true, alternativeSparePartId: "", suggestedSupplier: "" })} disabled={!clientId}>
              <Plus className="h-4 w-4" /> Adicionar material
            </button>
          </div>
          <p className="text-xs text-graphite-500">Ao gerar a OS, o sistema tenta reservar essas peças no almoxarifado (melhor esforço - sem saldo, a OS é gerada sem reservar).</p>
          {!clientId ? (
            <p className="text-sm text-graphite-500">Selecione o cliente para escolher materiais do almoxarifado.</p>
          ) : (
            <div className="space-y-2">
              {partFields.map((field, index) => (
                <div key={field.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <SparePartPicker
                      label=""
                      className="flex-1"
                      placeholder="Selecione a peça"
                      clientId={clientId}
                      error={errors.parts?.[index]?.sparePartId?.message}
                      {...register(`parts.${index}.sparePartId`)}
                    />
                    <TextInput
                      className="w-24"
                      type="number"
                      placeholder="Qtd."
                      error={errors.parts?.[index]?.quantity?.message}
                      {...register(`parts.${index}.quantity`)}
                    />
                    <button type="button" onClick={() => removePart(index)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover material">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <SparePartPicker
                      label="Substituto aceito"
                      placeholder="Nenhum"
                      clientId={clientId}
                      excludeId={watch(`parts.${index}.sparePartId`)}
                      {...register(`parts.${index}.alternativeSparePartId`)}
                    />
                    <TextInput label="Fornecedor sugerido" placeholder="Opcional" {...register(`parts.${index}.suggestedSupplier`)} />
                    <div className="flex items-end pb-2">
                      <CheckboxInput label="Material obrigatório" {...register(`parts.${index}.required`)} />
                    </div>
                  </div>
                </div>
              ))}
              {partFields.length === 0 && <p className="text-sm text-graphite-500">Nenhum material previsto.</p>}
            </div>
          )}
        </div>
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-navy-900">Checklist padrão</h2>
            <button type="button" className="btn-ghost btn-sm" onClick={() => append({ description: "", required: true, responseType: "YES_NO_NA" })}>
              <Plus className="h-4 w-4" /> Adicionar item
            </button>
          </div>
          <p className="text-xs text-graphite-500">Copiado para cada ordem de manutenção gerada a partir deste plano.</p>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <TextInput
                    className="flex-1"
                    placeholder={`Item ${index + 1}`}
                    error={errors.checklistTemplate?.[index]?.description?.message}
                    {...register(`checklistTemplate.${index}.description`)}
                  />
                  {fields.length > 1 && (
                    <button type="button" onClick={() => remove(index)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-4">
                  <TextInput label="Seção" placeholder="Ex.: Preparação" {...register(`checklistTemplate.${index}.section`)} />
                  <TextInput
                    label="Tempo (min)"
                    type="number"
                    min="0"
                    placeholder="0"
                    {...register(`checklistTemplate.${index}.estimatedMinutes`)}
                  />
                  <SelectInput
                    label="Tipo de resposta"
                    options={[
                      { value: "YES_NO_NA", label: "Sim / Não / N.A." },
                      { value: "NUMBER", label: "Medição numérica" },
                      { value: "TEXT", label: "Texto" },
                      { value: "PHOTO", label: "Foto" },
                      { value: "SIGNATURE", label: "Assinatura" },
                    ]}
                    {...register(`checklistTemplate.${index}.responseType`)}
                  />
                  <TextInput label="Referência" placeholder="Procedimento, desenho, manual" {...register(`checklistTemplate.${index}.reference`)} />
                </div>
                {watch(`checklistTemplate.${index}.responseType`) === "NUMBER" && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <TextInput label="Unidade" placeholder="mm/s, °C, bar" {...register(`checklistTemplate.${index}.unit`)} />
                    <TextInput label="Mínimo" type="number" step="any" {...register(`checklistTemplate.${index}.minValue`)} />
                    <TextInput label="Alvo" type="number" step="any" {...register(`checklistTemplate.${index}.targetValue`)} />
                    <TextInput label="Máximo" type="number" step="any" {...register(`checklistTemplate.${index}.maxValue`)} />
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-4">
                  <CheckboxInput label="Item obrigatório" {...register(`checklistTemplate.${index}.required`)} />
                  <CheckboxInput label="Exige foto" {...register(`checklistTemplate.${index}.requiresPhoto`)} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {isEdit ? (
          <EntityAttachments
            title="Anexo (opcional)"
            queryKey={["maintenance-plan-attachments", id]}
            canEdit
            list={() => listMaintenancePlanAttachments(id!)}
            upload={(file, category) => uploadMaintenancePlanAttachment(id!, file, category)}
            remove={(attachmentId) => deleteMaintenancePlanAttachment(id!, attachmentId)}
            getUrl={(attachmentId) => getMaintenancePlanAttachmentUrl(id!, attachmentId)}
          />
        ) : (
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold text-navy-900">Anexo (opcional)</h2>
            <p className="text-xs text-graphite-500">
              Procedimento, ficha tecnica ou foto de referencia - so um arquivo aqui; depois de salvo, a ficha do
              plano permite anexar mais.
            </p>
            <div className="flex items-center gap-3">
              <label className="btn-outline cursor-pointer text-sm">
                {anexoNovo ? "Trocar arquivo" : "Escolher arquivo"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setAnexoNovo(e.target.files?.[0] ?? null)}
                />
              </label>
              {anexoNovo && (
                <span className="flex items-center gap-1.5 text-sm text-graphite-600">
                  {anexoNovo.name}
                  <button type="button" className="text-graphite-400 hover:text-safety-red" onClick={() => setAnexoNovo(null)} aria-label="Remover arquivo escolhido">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )}
            </div>
          </div>
        )}

        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-outline" disabled={trocandoDeEtapa} onClick={() => (step === 0 ? navigate(-1) : goToStep(step - 1))}>
            {step === 0 ? "Cancelar" : "Voltar"}
          </button>
          {step < 2 ? (
            <button type="button" className="btn-primary" disabled={trocandoDeEtapa} onClick={() => goToStep(step + 1)}>
              Continuar
            </button>
          ) : (
            <button type="submit" className="btn-primary" disabled={isSubmitting || trocandoDeEtapa}>
              {isSubmitting ? "Salvando..." : "Salvar plano"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
