import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { TextInput, TextareaInput, SelectInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { UserPicker } from "../../../components/UserPicker";
import { LaborResourcePicker } from "../../../components/LaborResourcePicker";
import { SecaoRecolhivel } from "../../../components/SecaoRecolhivel";
import { listFailureCodes } from "../../../api/failureCodes";
import { listRotableEquipment } from "../../../api/rotableEquipment";
import { getInstrument } from "../../../api/instruments";
import { createMaintenanceWorkOrder, getMaintenanceWorkOrder, updateMaintenanceWorkOrder } from "../../../api/maintenanceWorkOrders";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { FullPageSpinner } from "../../../components/Spinner";
import { useCmms } from "../../../lib/cmms";
import { OPCOES_DE_TIPO, GRAVIDADES_DE_FALHA, valorDoTipo, SITUACOES_DE_ABERTURA } from "../../../lib/maintenanceLabels";
import { paraInputDeDataSaoPaulo } from "../../../lib/format";
import type { FailureSeverity, MaintenanceOrderStatus } from "../../../api/types";
import type { FieldErrors } from "react-hook-form";

const schema = z.object({
  clientId: z.string().uuid("Selecione o cliente."),
  instrumentId: z.string().uuid("Selecione o ativo."),
  // Vinculo duplo: instrumentId acima e' o local funcional; isto e' a unidade fisica
  // (motor, redutor...) que apresentou a falha. Em branco na criacao = deixa o backend
  // auto-sugerir o equipamento instalado no ativo agora (ver onSubmit).
  rotableEquipmentId: z.string().uuid().optional().or(z.literal("")),
  // Um seletor so, ja separando a corretiva em operacao da de quebra - o par (tipo,
  // tipo de corretiva) e' remontado no envio.
  tipoSelecionado: z.string().min(1, "Selecione o tipo de servico."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  title: z.string().min(3, "Informe um titulo curto.").max(200),
  description: z.string().min(2, "Descreva o servico."),
  technicianId: z.string().uuid().optional().or(z.literal("")),
  assignedResourceId: z.string().uuid().optional().or(z.literal("")),
  breakdownSituation: z.enum(["ALREADY_HAPPENED", "HAPPENING_NOW", "TO_PLAN"]).optional().or(z.literal("")),
  status: z.string().optional(),
  scheduledDate: z.string().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  failureCodeId: z.string().uuid().optional().or(z.literal("")),
  observations: z.string().optional(),
  // Registro de falha (obrigatorio para concluir uma corretiva de quebra).
  failureStartedAt: z.string().optional(),
  failureEndedAt: z.string().optional(),
  failureSeverity: z.enum(["LOW", "MODERATE", "HIGH", "CRITICAL"]).optional().or(z.literal("")),
  failureDescription: z.string().optional(),
  failureRootCause: z.string().optional(),
  failureCorrectiveAction: z.string().optional(),
  productionLoss: z.coerce.number().nonnegative().optional(),
  // Item em branco e' normal: a lista nasce com uma linha vazia (nada pra apagar se a OS
  // nao tiver passo a passo) e o envio ja filtra as vazias - exigir descricao aqui bloquearia
  // salvar por causa de um campo que a propria tela chama de "opcional".
  checklist: z.array(
    z.object({
      description: z.string(),
      estimatedMinutes: numeroOpcional(z.coerce.number().int().nonnegative()),
    }),
  ),
});
type FormValues = z.infer<typeof schema>;

/** Nome amigavel de cada campo, para o aviso de "faltou preencher" dizer o que falta em
 * vez de so recusar em silencio - inclui clientId, que no portal e' um campo escondido
 * (o cliente nao escolhe empresa) e por isso nao tem onde mostrar o erro pertinho dele. */
const ROTULO_DO_CAMPO: Partial<Record<keyof FormValues, string>> = {
  clientId: "Cliente",
  instrumentId: "Ativo",
  tipoSelecionado: "Tipo de servico",
  title: "Titulo",
  description: "Descricao",
  breakdownSituation: "Situacao da quebra",
  failureCodeId: "Categoria da falha",
};

export default function WorkOrderForm() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const isEdit = !!id;

  const { data: existing, isLoading } = useQuery({
    queryKey: ["maintenance-work-order", id],
    queryFn: () => getMaintenanceWorkOrder(id!),
    enabled: isEdit,
  });

  const { data: failureCodes } = useQuery({ queryKey: ["failure-codes-picker"], queryFn: () => listFailureCodes({ active: true }) });

  const { register, control, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting, dirtyFields } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: ownClientId ?? searchParams.get("clientId") ?? "",
      instrumentId: searchParams.get("instrumentId") ?? "",
      tipoSelecionado: "CORRECTIVE_IN_OPERATION",
      priority: "MEDIUM",
      status: "OPEN",
      checklist: [{ description: "", estimatedMinutes: undefined }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "checklist" });
  const clientId = watch("clientId");
  const tipoSelecionado = watch("tipoSelecionado");
  const opcaoDeTipo = OPCOES_DE_TIPO.find((o) => o.valor === tipoSelecionado);
  const ehCorretiva = opcaoDeTipo?.type === "CORRECTIVE";
  const ehQuebra = opcaoDeTipo?.correctiveType === "BREAKDOWN";
  const instrumentId = watch("instrumentId");
  // Equipamentos disponiveis pra vincular: o(s) instalado(s) no ativo agora, mais o que ja
  // estava vinculado (se a OS for de edicao e o vinculo tiver mudado desde entao - ex.:
  // uma substituicao levou o antigo pra quarentena, mas a OS antiga continua contando a
  // historia dele).
  const { data: rotaveisDoAtivo } = useQuery({
    queryKey: ["rotable-equipment-do-ativo-form", instrumentId],
    queryFn: () => listRotableEquipment({ instrumentId, status: "INSTALLED", pageSize: 10 }),
    enabled: !!instrumentId,
  });
  const opcoesDeEquipamento = (rotaveisDoAtivo?.items ?? []).map((r) => ({
    value: r.id,
    label: `${r.code} - ${r.type}${r.serialNumber ? ` (S/N ${r.serialNumber})` : ""}`,
  }));
  if (existing?.rotableEquipment && !opcoesDeEquipamento.some((o) => o.value === existing.rotableEquipment!.id)) {
    const re = existing.rotableEquipment;
    opcoesDeEquipamento.push({ value: re.id, label: `${re.code} - ${re.type} (vinculo atual da OS)` });
  }
  const situacaoDaQuebra = watch("breakdownSituation");
  const situacaoDaOs = watch("status");
  const descricao = watch("description");
  const titulo = watch("title");

  /**
   * Na CRIACAO os campos aparecem por partes, na ordem em que a pergunta faz sentido:
   * ativo -> tipo de servico -> o que e' -> quem e quando.
   *
   * Um formulario com trinta campos de uma vez faz quem esta com o celular na mao, ao lado
   * da maquina, desistir no meio - e o que ele mais erra e' preencher fora de ordem
   * (escrever a descricao antes de escolher o ativo, e depois trocar o ativo). Na EDICAO
   * tudo continua a vista: quem edita quer chegar direto no campo que veio corrigir.
   */
  const porPartes = !isEdit;
  const temAtivo = !!instrumentId;
  const temTipo = temAtivo && !!tipoSelecionado;
  const temOQueFazer = temTipo && (titulo ?? "").trim().length > 1 && (descricao ?? "").trim().length > 1;
  const mostrar = (etapa: boolean) => !porPartes || etapa;

  // Sugere a prioridade a partir da criticidade do ativo escolhido - o tecnico ainda
  // pode trocar (por isso so sobrescreve enquanto o campo nao foi tocado a mao).
  const { data: selectedInstrument } = useQuery({
    queryKey: ["instrument-for-priority", instrumentId],
    queryFn: () => getInstrument(instrumentId),
    enabled: !isEdit && !!instrumentId,
  });
  useEffect(() => {
    if (selectedInstrument && !dirtyFields.priority) {
      setValue("priority", selectedInstrument.criticality);
    }
  }, [selectedInstrument, dirtyFields.priority, setValue]);

  // No portal o cliente nao escolhe empresa - o campo nasce com ownClientId. Mas o usuario
  // logado chega de forma assincrona (AuthContext busca /auth/me), entao se este formulario
  // por algum motivo montar antes disso resolver, o valor inicial ficaria "" para sempre
  // (defaultValues so' e' lido uma vez). Sem isso, a OS falhava calada: o campo e' um
  // <input hidden>, entao o erro de validacao nunca aparecia em lugar nenhum.
  useEffect(() => {
    if (isClient && ownClientId && !isEdit) setValue("clientId", ownClientId);
  }, [isClient, ownClientId, isEdit, setValue]);

  useEffect(() => {
    if (existing) {
      reset({
        clientId: existing.clientId,
        instrumentId: existing.instrumentId,
        rotableEquipmentId: existing.rotableEquipmentId ?? "",
        tipoSelecionado: valorDoTipo(existing.type, existing.correctiveType),
        priority: existing.priority,
        title: existing.title ?? "",
        description: existing.description,
        technicianId: existing.technicianId ?? "",
        assignedResourceId: existing.assignedResourceId ?? "",
        breakdownSituation: existing.breakdownSituation ?? "",
        status: existing.status ?? "OPEN",
        scheduledDate: paraInputDeDataSaoPaulo(existing.scheduledDate).data,
        plannedStart: paraInputDeDataSaoPaulo(existing.plannedStart).horaMinuto,
        plannedEnd: paraInputDeDataSaoPaulo(existing.plannedEnd).horaMinuto,
        estimatedHours: existing.estimatedHours ?? undefined,
        failureCodeId: existing.failureCodeId ?? "",
        observations: existing.observations ?? "",
        failureStartedAt: paraInputDeDataSaoPaulo(existing.failureStartedAt).horaMinuto,
        failureEndedAt: paraInputDeDataSaoPaulo(existing.failureEndedAt).horaMinuto,
        failureSeverity: existing.failureSeverity ?? "",
        failureDescription: existing.failureDescription ?? "",
        failureRootCause: existing.failureRootCause ?? "",
        failureCorrectiveAction: existing.failureCorrectiveAction ?? "",
        productionLoss: existing.productionLoss ?? undefined,
        checklist: existing.checklist?.length
          ? existing.checklist.map((c) => ({ description: c.description, estimatedMinutes: c.estimatedMinutes ?? undefined }))
          : [{ description: "", estimatedMinutes: undefined }],
      });
    }
  }, [existing, reset]);

  async function onSubmit(values: FormValues) {
    try {
      // Os campos de falha saem do "resto" e voltam so quando a OS e' corretiva - senao
      // viajariam como "" numa preventiva.
      const {
        tipoSelecionado: escolha,
        failureStartedAt: _fs,
        failureEndedAt: _fe,
        failureSeverity: _sev,
        failureDescription: _fd,
        failureRootCause: _frc,
        failureCorrectiveAction: _fca,
        productionLoss: _pl,
        ...resto
      } = values;
      const opcao = OPCOES_DE_TIPO.find((o) => o.valor === escolha);
      // Campos de falha so viajam quando a OS e' corretiva - noutro tipo o backend recusa,
      // e com razao: nao descreveriam nada.
      const registroDeFalha = opcao?.type === "CORRECTIVE"
        ? {
            failureStartedAt: values.failureStartedAt || null,
            failureEndedAt: values.failureEndedAt || null,
            failureSeverity: (values.failureSeverity || null) as FailureSeverity | null,
            failureDescription: values.failureDescription || null,
            failureRootCause: values.failureRootCause || null,
            failureCorrectiveAction: values.failureCorrectiveAction || null,
            productionLoss: values.productionLoss ?? null,
          }
        : {};

      // Se ninguem mexeu no campo na criacao, nem manda ele - assim o backend continua
      // auto-sugerindo o equipamento instalado no ativo (mandar "" vira null explicito,
      // que desliga essa sugestao mesmo sem a pessoa ter decidido nada sobre isso).
      const { rotableEquipmentId: _reqRaw, ...restoSemEquipamento } = resto;
      const vinculoDeEquipamento =
        isEdit || dirtyFields.rotableEquipmentId ? { rotableEquipmentId: values.rotableEquipmentId || null } : {};

      const payload = {
        ...restoSemEquipamento,
        ...vinculoDeEquipamento,
        type: opcao!.type,
        correctiveType: opcao!.correctiveType,
        ...registroDeFalha,
        technicianId: values.technicianId || null,
        assignedResourceId: values.assignedResourceId || null,
        failureCodeId: values.failureCodeId || null,
        // Campo de data em branco vai como null, e nao como "" - foi o que quebrava a
        // criacao com "scheduledDate: Invalid date" quando ninguem agendava a OS.
        scheduledDate: values.scheduledDate || null,
        plannedStart: values.plannedStart || null,
        plannedEnd: values.plannedEnd || null,
        breakdownSituation: opcao?.correctiveType === "BREAKDOWN" ? values.breakdownSituation || null : null,
        status: (values.status || undefined) as MaintenanceOrderStatus | undefined,
        checklist: values.checklist
          .filter((c) => c.description.trim())
          .map((c) => ({ description: c.description, estimatedMinutes: c.estimatedMinutes ?? null })),
      };
      const saved = isEdit ? await updateMaintenanceWorkOrder(id!, payload) : await createMaintenanceWorkOrder(payload);
      notify("success", isEdit ? "OS atualizada." : "OS criada.");
      navigate(`${base}/ordens/${saved.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  /** O botao "Salvar" nao fazer nada, sem explicar por que, e' o pior caso: alguns campos
   * exigidos (o cliente no portal, por exemplo) sao um <input hidden> sem erro visivel do
   * lado. Este aviso garante que SEMPRE aparece o que falta, mesmo quando o campo em si
   * nao tem onde mostrar. */
  function onInvalid(erros: FieldErrors<FormValues>) {
    const campos = Object.keys(erros)
      .map((campo) => ROTULO_DO_CAMPO[campo as keyof FormValues] ?? campo)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    notify(
      "error",
      campos.length ? `Falta preencher: ${campos.join(", ")}.` : "Ha campos obrigatorios nao preenchidos.",
    );
  }

  if (isEdit && isLoading) return <FullPageSpinner />;

  return (
    <div>
      <PageHeader
        title={isEdit ? `Editar OS ${existing?.number ?? ""}` : "Nova ordem de manutencao"}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Ordens", to: `${base}/ordens` },
          { label: isEdit ? "Editar" : "Nova" },
        ]}
      />

      <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
        <div className="card space-y-4 p-5">
          <h2 className="font-semibold text-navy-900">Identificacao</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {isClient ? (
              <div>
                <input type="hidden" {...register("clientId")} />
                {/* So aparece se algo der errado (ex.: sessao carregou sem empresa vinculada) -
                    normalmente este campo nem existe na tela, o cliente e' implicito. */}
                {errors.clientId && <p className="text-xs text-safety-red">{errors.clientId.message}</p>}
              </div>
            ) : (
              <ClientPicker required error={errors.clientId?.message} {...register("clientId")} />
            )}
            <InstrumentPicker clientId={clientId} required error={errors.instrumentId?.message} {...register("instrumentId")} />
          </div>
          {/* Vinculo duplo: o Ativo acima e' o local funcional; isto e' a unidade fisica
              (motor, redutor...) que apresentou a falha. Sem escolha explicita na criacao,
              o backend auto-sugere o equipamento instalado no ativo agora - aqui da pra
              corrigir isso manualmente (ex.: o diagnostico revelou outro equipamento) sem
              precisar passar pela substituicao fisica de verdade (isso continua sendo o
              botao "Substituir equipamento" na propria OS, que troca o equipamento no
              ativo de verdade). */}
          {temAtivo && (
            <SelectInput
              label="Equipamento (unidade fisica que falhou)"
              placeholder={opcoesDeEquipamento.length ? "Detecta automaticamente" : "Nenhum equipamento instalado neste ativo"}
              hint="So' corrige o vinculo da OS. Para trocar o equipamento fisico de verdade, use 'Substituir equipamento' na ficha da OS."
              options={opcoesDeEquipamento}
              {...register("rotableEquipmentId")}
            />
          )}
          {/* Titulo curto: e' o que aparece na lista de OS e no quadro de programacao. A
              descricao abaixo continua sendo o relato completo do sintoma/servico. */}
          {mostrar(temTipo) && (
          <TextInput
            label="Titulo"
            required
            placeholder="Ex.: Troca do rolamento do mancal lado acoplamento"
            hint="Resumo em uma linha - e' o que aparece nas listas e na programacao."
            error={errors.title?.message}
            {...register("title")}
          />
          )}
          {mostrar(temAtivo) && (
          <div className={`grid gap-4 ${isClient ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
            <SelectInput
              label="Tipo de servico"
              required
              hint={ehQuebra ? "Quebra: o registro da falha e' obrigatorio para concluir." : undefined}
              options={OPCOES_DE_TIPO.map((o) => ({ value: o.valor, label: o.rotulo }))}
              error={errors.tipoSelecionado?.message}
              {...register("tipoSelecionado")}
            />
          </div>
          )}

          {/* Uma quebra chega em tres momentos, e o que da para preencher muda em cada um.
              Perguntar isso antes evita o pior caso: inventar um horario de termino com a
              maquina ainda parada, que faria o MTTR medir um numero que nunca existiu. */}
          {mostrar(temTipo) && ehQuebra && (
            <div className="rounded-lg border-2 border-safety-red/40 bg-red-50/40 p-4">
            <SelectInput
              label="Situacao da quebra"
              required
              hint={
                situacaoDaQuebra === "HAPPENING_NOW"
                  ? "A maquina esta parada: informe so quando ela parou - o termino entra quando ela voltar."
                  : situacaoDaQuebra === "TO_PLAN"
                    ? "Sem janela de falha por enquanto; ela e' preenchida quando o atendimento acontecer."
                    : "Maquina ja voltou: informe quando parou e quando voltou."
              }
              options={[
                { value: "ALREADY_HAPPENED", label: "Ja aconteceu - a maquina ja voltou" },
                { value: "HAPPENING_NOW", label: "Esta acontecendo agora - maquina parada" },
                { value: "TO_PLAN", label: "Vou planejar - sera atendida depois" },
              ]}
              error={errors.breakdownSituation?.message}
              {...register("breakdownSituation")}
            />
            </div>
          )}

          {mostrar(temTipo) && (
          <TextareaInput
            label="Descricao / sintoma"
            required
            rows={3}
            hint="O relato completo: o que foi observado ou o que precisa ser feito."
            error={errors.description?.message}
            {...register("description")}
          />
          )}

          {/* Quem e com que urgencia - depois de o servico estar descrito, que e' quando a
              resposta existe. */}
          {mostrar(temOQueFazer) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Prioridade continua a vista: ela ja nasce preenchida (Media) e decide a
                ordem da fila - nao e' um campo em branco que se possa esconder. */}
            <SelectInput
              label="Prioridade"
              options={[
                { value: "LOW", label: "Baixa" },
                { value: "MEDIUM", label: "Media" },
                { value: "HIGH", label: "Alta" },
                { value: "CRITICAL", label: "Critica" },
              ]}
              {...register("priority")}
            />
            {/* Quem abre ja sabe em que pe a OS esta: uma quebra em atendimento nasce
                Liberada, uma que espera peca nasce Aguardando material. Concluida e
                Cancelada nao entram aqui - so na ficha da OS, onde tem regra. */}
            {!isEdit && (
              <SelectInput
                label="Situacao da OS"
                hint={SITUACOES_DE_ABERTURA.find((o) => o.valor === situacaoDaOs)?.ajuda ?? "Como a OS nasce."}
                options={SITUACOES_DE_ABERTURA.map((o) => ({ value: o.valor, label: o.rotulo }))}
                {...register("status")}
              />
            )}
            {ehCorretiva && (
              <SelectInput
                label="Categoria da falha"
                required={ehQuebra}
                placeholder="Selecione a causa"
                options={(failureCodes ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.description}` }))}
                {...register("failureCodeId")}
              />
            )}
          </div>
          )}

          {/* Daqui para baixo tudo e' opcional: fica recolhido para o formulario mostrar
              primeiro o que ele exige. */}
          {mostrar(temOQueFazer) && (
            <SecaoRecolhivel titulo="Responsavel" dica="opcional">
              <div className={`grid gap-4 ${isClient ? "" : "sm:grid-cols-2"}`}>
                {!isClient && (
                  <UserPicker label="Tecnico responsavel" roles={["ADMIN", "TECHNICIAN"]} error={errors.technicianId?.message} {...register("technicianId")} />
                )}
                <LaborResourcePicker
                  label="Quem vai executar"
                  placeholder={clientId ? "Buscar por nome, funcao ou matricula" : "Selecione o cliente primeiro"}
                  disabled={!clientId}
                  clientId={clientId}
                  hint="Tambem da para definir arrastando no quadro de programacao ou no planejamento."
                  error={errors.assignedResourceId?.message}
                  {...register("assignedResourceId")}
                />
              </div>
            </SecaoRecolhivel>
          )}

          {mostrar(temOQueFazer) && (
            <SecaoRecolhivel titulo="Observacoes" dica="opcional">
              <TextareaInput label="Observacoes" rows={2} {...register("observations")} />
            </SecaoRecolhivel>
          )}

          {/* Diz o que vem a seguir, para o formulario curto nao parecer quebrado. */}
          {porPartes && !temOQueFazer && (
            <p className="text-xs text-graphite-500">
              {!temAtivo
                ? "Escolha o ativo para continuar."
                : !temTipo
                  ? "Escolha o tipo de servico para continuar."
                  : "Preencha o titulo e a descricao - o resto aparece em seguida."}
            </p>
          )}
        </div>

        {/* Registro de falha: aparece na corretiva, com destaque quando e' quebra - e' o que
            o backend vai cobrar para deixar concluir. Fica no proprio formulario (e nao
            escondido numa aba) porque e' preenchido junto com o atendimento. */}
        {ehCorretiva && mostrar(temOQueFazer) && (
          <div className={`card space-y-4 p-5 ${ehQuebra ? "border-2 border-safety-red/40" : ""}`}>
            <div>
              <h2 className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                Registro da falha
                {ehQuebra ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-safety-red">
                    obrigatorio na corretiva de quebra
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-graphite-500">opcional em operacao</span>
                )}
              </h2>
              <p className="text-xs text-graphite-500">
                Alimenta o Pareto de falhas e a tela de Falhas e RCA. O tempo parado e' calculado das datas.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextInput
                label="Inicio da falha"
                type="datetime-local"
                required={ehQuebra && situacaoDaQuebra !== "TO_PLAN"}
                hint={situacaoDaQuebra === "TO_PLAN" ? "Preencha quando o atendimento acontecer." : undefined}
                {...register("failureStartedAt")}
              />
              {/* Com a maquina parada agora, nao existe termino: preencher aqui seria
                  chutar a hora em que ela vai voltar. */}
              {situacaoDaQuebra !== "HAPPENING_NOW" && (
                <TextInput
                  label="Termino da falha"
                  type="datetime-local"
                  required={ehQuebra && situacaoDaQuebra === "ALREADY_HAPPENED"}
                  {...register("failureEndedAt")}
                />
              )}
              <SelectInput
                label="Gravidade"
                placeholder="Nao informada"
                required={ehQuebra}
                options={GRAVIDADES_DE_FALHA.map((g) => ({ value: g.valor, label: g.rotulo }))}
                {...register("failureSeverity")}
              />
            </div>

            <TextareaInput
              label="Descricao da falha / sintoma"
              required={ehQuebra}
              rows={2}
              hint="O laudo de quem foi ver - diferente do pedido que abriu a OS."
              {...register("failureDescription")}
            />

            {/* O que so se sabe depois de investigar - fica recolhido para nao competir
                com o que a OS exige agora. */}
            <SecaoRecolhivel titulo="Mais sobre a falha" dica="opcional">
              <TextInput
                label="Perda de producao"
                type="number"
                step="any"
                min="0"
                hint="Estimativa, na unidade da empresa."
                {...register("productionLoss")}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextareaInput label="Causa identificada" rows={2} hint="A causa raiz de verdade sai da RCA." {...register("failureRootCause")} />
                <TextareaInput label="Acao corretiva tomada" rows={2} {...register("failureCorrectiveAction")} />
              </div>
            </SecaoRecolhivel>
          </div>
        )}

        {mostrar(temOQueFazer) && (
        <div className="card p-5">
          <SecaoRecolhivel titulo="Planejamento" dica="opcional - data, janela e horas previstas">
          <p className="text-xs text-graphite-500">
            A data agendada e' o dia em que a OS aparece na programacao. A janela e as horas estimadas
            sao a previsao - o que foi realmente gasto e' apontado na aba Equipe e horas da OS.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Data agendada" type="date" {...register("scheduledDate")} />
            <TextInput label="Inicio planejado" type="datetime-local" {...register("plannedStart")} />
            <TextInput
              label="Termino planejado"
              type="datetime-local"
              error={errors.plannedEnd?.message}
              {...register("plannedEnd")}
            />
            <TextInput label="Horas estimadas" type="number" step="0.5" min="0" {...register("estimatedHours")} />
          </div>
          </SecaoRecolhivel>
        </div>
        )}

        {mostrar(temOQueFazer) && (
        <div className="card p-5">
          <SecaoRecolhivel titulo="Operacoes do servico" dica="opcional - o passo a passo">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-graphite-500">O que fazer, em ordem, e o tempo esperado de cada uma (em minutos).</p>
            </div>
            <button type="button" className="btn-ghost btn-sm" onClick={() => append({ description: "", estimatedMinutes: undefined })}>
              <Plus className="h-4 w-4" /> Adicionar item
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <TextInput
                  className="flex-1"
                  placeholder={`Operacao ${index + 1}`}
                  error={errors.checklist?.[index]?.description?.message}
                  {...register(`checklist.${index}.description`)}
                />
                <TextInput
                  className="w-28 shrink-0"
                  type="number"
                  min="0"
                  placeholder="min"
                  {...register(`checklist.${index}.estimatedMinutes`)}
                />
                {fields.length > 1 && (
                  <button type="button" onClick={() => remove(index)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover item">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          </SecaoRecolhivel>
        </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" className="btn-outline" onClick={() => navigate(-1)}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
