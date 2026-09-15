import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Droplets, AlertTriangle, Check, Search } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { Tabs } from "../../../components/Tabs";
import { DataTable } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput, TextareaInput, SelectInput } from "../../../components/form/Field";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { LaborResourcePicker } from "../../../components/LaborResourcePicker";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import {
  listLubricants,
  listLubricationPoints,
  createLubricationPoint,
  updateLubricationPoint,
  registrarLubrificacao,
  listPendingLubricationPoints,
  proximoCodigoDePonto,
  concluirPontosDoAtivo,
} from "../../../api/lubrication";
import type { LubricationPoint } from "../../../api/types";
import type { AtivoSemPonto } from "../../../api/lubrication";
import { formatDate } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";
import { METODOS_DE_LUBRIFICACAO } from "../../../lib/maintenanceLabels";
import { ESTADOS_DA_MAQUINA, CONDICOES_DO_PONTO } from "../../../lib/lubricationLabels";

const pointSchema = z.object({
  instrumentId: z.string().uuid("Selecione o ativo."),
  // Em branco o servidor numera sozinho a partir do TAG do ativo.
  code: z.string().optional(),
  name: z.string().min(2, "Informe o nome do ponto."),
  component: z.string().optional(),
  lubricantId: z.string().uuid("Selecione o lubrificante."),
  quantityPerApplication: z.coerce.number().positive("Informe a quantidade por aplicação."),
  method: z.enum(["MANUAL_GUN", "AUTOMATIC_CENTRAL", "OIL_BATH", "IMMERSION", "BRUSH", "SPRAY"]),
  frequencyDays: z.coerce.number().int().positive("Informe a periodicidade em dias."),
  machineState: z.enum(["STOPPED", "RUNNING", "ANY"]),
  accessNotes: z.string().optional(),
  safetyNotes: z.string().optional(),
  lastLubricatedAt: z.string().optional(),
});
type PointForm = z.infer<typeof pointSchema>;

const recordSchema = z.object({
  quantity: z.coerce.number().positive("Informe a quantidade aplicada."),
  executedAt: z.string().optional(),
  laborResourceId: z.string().uuid().optional().or(z.literal("")),
  conditionBefore: z.enum(["NORMAL", "LOW", "DRY", "CONTAMINATED", "EXCESS"]).optional().or(z.literal("")),
  conditionAfter: z.enum(["NORMAL", "LOW", "DRY", "CONTAMINATED", "EXCESS"]).optional().or(z.literal("")),
  notes: z.string().optional(),
});
type RecordForm = z.infer<typeof recordSchema>;

function situacaoDoPonto(p: LubricationPoint): { rotulo: string; tom: string } {
  if (!p.nextDueAt) return { rotulo: "Sem programação", tom: "border-gray-200 bg-gray-50 text-graphite-500" };
  const dias = Math.floor((new Date(p.nextDueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (dias < 0) return { rotulo: `${Math.abs(dias)}d de atraso`, tom: "border-red-200 bg-red-50 text-safety-red" };
  if (dias <= 7) return { rotulo: `vence em ${dias}d`, tom: "border-yellow-200 bg-yellow-50 text-safety-yellow-dark" };
  return { rotulo: `em ${dias}d`, tom: "border-green-200 bg-green-50 text-safety-green-dark" };
}

export default function LubricationPointsList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? ownClientId ?? "" : searchParams.get("clientId") ?? "";
  const [situacao, setSituacao] = useState<"" | "vencidos" | "proximos">("");
  const [page, setPage] = useState(1);
  const [editando, setEditando] = useState<LubricationPoint | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [registrando, setRegistrando] = useState<LubricationPoint | null>(null);
  // Chegando pela ficha do ativo ("Cadastrar ponto"), a tela ja abre filtrada nele - e com
  // o formulario aberto e o ativo preenchido quando o link pede.
  const instrumentId = searchParams.get("instrumentId") ?? "";
  // Com dois mil pontos ninguem abre ficha por ficha para achar o que ficou pela metade,
  // e um ativo sem ponto nao aparece em rota nenhuma: a falta dele e' silenciosa. Esta
  // aba e' a fila de trabalho de quem esta montando o plano.
  const [aba, setAba] = useState<"cadastrados" | "pendentes">("cadastrados");
  const [busca, setBusca] = useState("");
  // Marcado por padrao no cadastro em lote: quem abre pelo "Cadastrar ponto" de um ativo
  // pendente quase sempre tem mais de um ponto para lancar.
  const [continuarNoAtivo, setContinuarNoAtivo] = useState(true);
  const abrirNovoAoEntrar = searchParams.get("novo") === "1";

  const { data: lubricants } = useQuery({
    queryKey: ["lubrificantes", clientId],
    queryFn: () => listLubricants({ clientId, active: true }),
    enabled: !!clientId,
  });
  const { data, isLoading } = useQuery({
    queryKey: ["pontos-lubrificacao", clientId, situacao, page, instrumentId, busca],
    queryFn: () => listLubricationPoints({ clientId, situacao: situacao || undefined, instrumentId: instrumentId || undefined, search: busca || undefined, page, pageSize: 20 }),
    enabled: !!clientId,
  });
  const { data: pendentes, isLoading: carregandoPendentes } = useQuery({
    queryKey: ["pontos-pendentes", clientId, page, busca],
    queryFn: () => listPendingLubricationPoints({ clientId, search: busca || undefined, page, pageSize: 20 }),
    enabled: !!clientId,
  });

  const pointForm = useForm<PointForm>({
    resolver: zodResolver(pointSchema),
    defaultValues: { method: "MANUAL_GUN", machineState: "ANY", frequencyDays: 30 },
  });
  const recordForm = useForm<RecordForm>({ resolver: zodResolver(recordSchema) });

  // Um motor tem varios pontos, e batizar cada um na mao e' onde nascem os codigos
  // repetidos. Escolhido o ativo, o proximo numero livre ja aparece no campo - editavel,
  // e so quando o campo esta vazio, para nao apagar o que a pessoa digitou.
  //
  // A busca fica numa funcao a parte (e nao so dentro do useEffect) porque o instrumentId
  // NAO MUDA entre um ponto e o proximo no fluxo "Salvar e continuar": o formulario e'
  // resetado mantendo o mesmo ativo, e um useEffect nao dispara de novo quando nenhuma
  // dependencia mudou de valor. Sem chamar isto explicitamente apos o reset, o campo
  // ficava em branco (em vez de avancar sozinho) e a proxima sugestao repetia o numero
  // ja usado - foi o que forcou a correcao manual.
  // Contador em vez de um cleanup de useEffect: agora ha dois pontos que pedem a
  // sugestao (o efeito abaixo e o reset do "salvar e continuar"), e uma resposta atrasada
  // de um pedido antigo nao pode sobrescrever o que um pedido mais novo ja respondeu.
  const pedidoDeCodigoRef = useRef(0);
  const buscarProximoCodigo = useCallback(
    (ativoId: string) => {
      if (!ativoId || !clientId) return;
      const meuPedido = ++pedidoDeCodigoRef.current;
      proximoCodigoDePonto(ativoId, clientId)
        .then((codigo) => {
          if (meuPedido !== pedidoDeCodigoRef.current) return; // superado por um pedido mais novo
          if (!pointForm.getValues("code")?.trim()) pointForm.setValue("code", codigo);
        })
        .catch(() => undefined);
    },
    [clientId, pointForm],
  );

  const ativoDoFormulario = pointForm.watch("instrumentId");
  useEffect(() => {
    if (!formOpen || editando || !ativoDoFormulario || !clientId) return;
    if (pointForm.getValues("code")?.trim()) return;
    buscarProximoCodigo(ativoDoFormulario);
  }, [formOpen, editando, ativoDoFormulario, clientId, buscarProximoCodigo, pointForm]);

  const abrirNovo = useCallback(
    (ativoId = "") => {
      setEditando(null);
      pointForm.reset({ method: "MANUAL_GUN", machineState: "ANY", frequencyDays: 30, instrumentId: ativoId, code: "", name: "" });
      setFormOpen(true);
    },
    [pointForm],
  );

  // Abre uma vez so: depois disso o parametro sai da URL, senao fechar o formulario e
  // recarregar a tela reabriria ele sozinho.
  useEffect(() => {
    if (!abrirNovoAoEntrar || !clientId) return;
    abrirNovo(instrumentId);
    const resto = new URLSearchParams(searchParams);
    resto.delete("novo");
    setSearchParams(resto, { replace: true });
  }, [abrirNovoAoEntrar, clientId, instrumentId, abrirNovo, searchParams, setSearchParams]);

  function abrirEdicao(p: LubricationPoint) {
    setEditando(p);
    pointForm.reset({
      instrumentId: p.instrumentId,
      code: p.code,
      name: p.name,
      component: p.component ?? "",
      lubricantId: p.lubricantId,
      quantityPerApplication: p.quantityPerApplication,
      method: p.method,
      frequencyDays: p.frequencyDays,
      machineState: p.machineState,
      accessNotes: p.accessNotes ?? "",
      safetyNotes: p.safetyNotes ?? "",
      lastLubricatedAt: p.lastLubricatedAt?.slice(0, 10) ?? "",
    });
    setFormOpen(true);
  }

  async function salvarPonto(values: PointForm) {
    try {
      const payload = {
        ...values,
        clientId,
        component: values.component || null,
        accessNotes: values.accessNotes || null,
        safetyNotes: values.safetyNotes || null,
        lastLubricatedAt: values.lastLubricatedAt || null,
      };
      if (editando) await updateLubricationPoint(editando.id, payload);
      else await createLubricationPoint(payload);
      notify("success", editando ? "Ponto atualizado." : "Ponto cadastrado.");
      atualizarListas();

      // Um motor tem varios pontos. Fechar o formulario a cada um obrigava a escolher o
      // ativo de novo tres vezes seguidas - e' quando alguem para no primeiro e esquece o
      // resto. Continuando, o ativo fica, o codigo avanca sozinho e o resto entra limpo.
      if (continuarNoAtivo && !editando) {
        const ativo = values.instrumentId;
        pointForm.reset({
          method: "MANUAL_GUN",
          machineState: "ANY",
          frequencyDays: values.frequencyDays,
          lubricantId: values.lubricantId,
          instrumentId: ativo,
          code: "",
          name: "",
        });
        // O instrumentId nao muda entre um ponto e o proximo aqui - o useEffect que busca
        // a sugestao so dispara quando uma dependencia muda, entao precisa ser chamado a
        // mao. O ponto que acabou de ser criado ja esta gravado (o create acima usou
        // await), entao a busca ja enxerga ele e sugere o proximo numero de verdade.
        buscarProximoCodigo(ativo);
        return;
      }
      setFormOpen(false);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  function atualizarListas() {
    queryClient.invalidateQueries({ queryKey: ["pontos-lubrificacao"] });
    queryClient.invalidateQueries({ queryKey: ["pontos-pendentes"] });
    queryClient.invalidateQueries({ queryKey: ["pontos-do-ativo"] });
    queryClient.invalidateQueries({ queryKey: ["lubrificacao-dashboard"] });
  }

  async function concluirAtivo(instrumentId: string) {
    try {
      await concluirPontosDoAtivo(instrumentId, true);
      notify("success", "Ativo concluído - saiu da fila de pendentes.");
      atualizarListas();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function salvarRegistro(values: RecordForm) {
    if (!registrando) return;
    try {
      await registrarLubrificacao(registrando.id, {
        quantity: values.quantity,
        executedAt: values.executedAt || undefined,
        laborResourceId: values.laborResourceId || null,
        conditionBefore: values.conditionBefore || null,
        conditionAfter: values.conditionAfter || null,
        notes: values.notes || null,
      });
      notify("success", "Lubrificação registrada - o estoque foi baixado e o ponto reprogramado.");
      setRegistrando(null);
      recordForm.reset();
      queryClient.invalidateQueries({ queryKey: ["pontos-lubrificacao"] });
      queryClient.invalidateQueries({ queryKey: ["lubrificacao-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["lubrificantes"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  const opcoesDeLubrificante = (lubricants ?? []).map((l) => ({
    value: l.id,
    label: `${l.sparePart.name}${l.specification ? ` (${l.specification})` : ""} - saldo ${l.sparePart.stockQty} ${l.sparePart.unit}`,
  }));

  return (
    <div>
      <PageHeader
        title="Pontos de lubrificação"
        description="Cada ponto diz qual lubrificante, quanto e de quanto em quanto tempo"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Lubrificação", to: `${base}/lubrificacao` },
          { label: "Pontos" },
        ]}
        actions={
          <button className="btn-primary" onClick={() => abrirNovo(instrumentId)} disabled={!clientId || opcoesDeLubrificante.length === 0}>
            <Plus className="h-4 w-4" /> Novo ponto
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3">
        {!isClient && (
          <ClientFilterSelect
            className="sm:w-64"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        )}
        <select
          className="input sm:w-56"
          value={situacao}
          onChange={(e) => { setSituacao(e.target.value as typeof situacao); setPage(1); }}
        >
          <option value="">Todas as situações</option>
          <option value="vencidos">Somente vencidos</option>
          <option value="proximos">Vencem em 7 dias</option>
        </select>
        <div className="relative flex-1 sm:min-w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            className="input pl-9"
            placeholder={aba === "pendentes" ? "Buscar ativo por TAG ou nome..." : "Buscar ponto por código, nome ou ativo..."}
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {clientId && (
        <div className="mb-4">
          <Tabs
            tabs={[
              { id: "cadastrados", label: `Cadastrados${data ? ` (${data.total})` : ""}` },
              { id: "pendentes", label: `Pendentes de cadastro${pendentes ? ` (${pendentes.total})` : ""}` },
            ]}
            active={aba}
            onChange={(id) => { setAba(id as typeof aba); setPage(1); }}
          />
        </div>
      )}

      {clientId && aba === "pendentes" ? (
        <DataTable<AtivoSemPonto>
          rows={pendentes?.items ?? []}
          loading={carregandoPendentes}
          keyField={(a) => a.id}
          pagination={pendentes}
          onPageChange={setPage}
          emptyTitle="Nenhum ativo esperando ponto"
          emptyDescription="Todo ativo marcado como lubrificável já foi concluído."
          columns={[
            {
              header: "Ativo",
              accessor: (a) => (
                <div>
                  <p className="font-medium text-navy-900">{a.description || a.type}</p>
                  <p className="text-xs text-graphite-400">TAG {a.tag ?? "sem TAG"}</p>
                </div>
              ),
            },
            { header: "Componente de", accessor: (a) => (a.parent ? `TAG ${a.parent.tag ?? ""}` : "-") },
            { header: "Planta", accessor: (a) => a.plant?.name ?? "-" },
            { header: "Área", accessor: (a) => a.area?.name ?? "-" },
            {
              // Um TAG pode ter varios pontos: "2 pontos, falta confirmar" e "nem comecou"
              // sao situacoes diferentes na hora de decidir por onde comecar.
              header: "Pontos",
              accessor: (a) =>
                a.pontosCadastrados > 0 ? (
                  <span className="font-medium text-navy-900">{a.pontosCadastrados}</span>
                ) : (
                  <span className="text-graphite-400">nenhum</span>
                ),
            },
            {
              header: "",
              accessor: (a) => (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    className="btn-outline text-sm"
                    onClick={() => abrirNovo(a.id)}
                    disabled={opcoesDeLubrificante.length === 0}
                  >
                    <Plus className="h-4 w-4" /> Adicionar ponto
                  </button>
                  {/* So quem olhou a maquina sabe quantos pontos ela tem - por isso quem
                      tira o ativo da fila e' a pessoa, e nao o primeiro ponto salvo. */}
                  <button
                    className="btn-ghost text-sm"
                    onClick={() => concluirAtivo(a.id)}
                    disabled={a.pontosCadastrados === 0}
                    title={a.pontosCadastrados === 0 ? "Cadastre ao menos um ponto antes de concluir" : "Não há mais pontos neste ativo"}
                  >
                    <Check className="h-4 w-4" /> Concluir
                  </button>
                </div>
              ),
            },
          ]}
        />
      ) : !clientId ? (
        <EmptyState title="Selecione o cliente" description="Os pontos de lubrificação são dos equipamentos de cada empresa." />
      ) : opcoesDeLubrificante.length === 0 ? (
        <EmptyState
          title="Cadastre um lubrificante primeiro"
          description="Um ponto precisa dizer qual graxa ou óleo usa. Em Lubrificação > Lubrificantes, transforme a peça do almoxarifado em lubrificante."
        />
      ) : (
        <DataTable<LubricationPoint>
          rows={data?.items ?? []}
          loading={isLoading}
          keyField={(p) => p.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhum ponto cadastrado"
          columns={[
            {
              header: "Ponto",
              accessor: (p) => (
                <div>
                  <p className="font-medium text-navy-900">{p.code} - {p.name}</p>
                  <p className="text-xs text-graphite-400">
                    {p.instrument?.tag ?? "sem TAG"}
                    {p.component ? ` - ${p.component}` : ""}
                  </p>
                </div>
              ),
            },
            {
              header: "Lubrificante",
              accessor: (p) => (
                <div>
                  <p className="text-graphite-800">{p.lubricant?.sparePart.name ?? "-"}</p>
                  <p className="text-xs text-graphite-400">
                    {p.quantityPerApplication} {p.lubricant?.sparePart.unit ?? ""} por aplicação
                  </p>
                </div>
              ),
            },
            { header: "A cada", accessor: (p) => `${p.frequencyDays} dias` },
            {
              header: "Máquina",
              accessor: (p) =>
                p.machineState === "STOPPED" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-safety-red">
                    <AlertTriangle className="h-3.5 w-3.5" /> só parada
                  </span>
                ) : (
                  <span className="text-xs text-graphite-500">{ESTADOS_DA_MAQUINA[p.machineState]}</span>
                ),
            },
            {
              header: "Última",
              accessor: (p) => (p.lastLubricatedAt ? formatDate(p.lastLubricatedAt) : "nunca"),
            },
            {
              header: "Situação",
              accessor: (p) => {
                const s = situacaoDoPonto(p);
                return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${s.tom}`}>{s.rotulo}</span>;
              },
            },
            {
              header: "",
              accessor: (p) => (
                <div className="flex justify-end gap-2">
                  <button className="btn-ghost btn-sm" onClick={() => abrirEdicao(p)}>Editar</button>
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => { setRegistrando(p); recordForm.reset({ quantity: p.quantityPerApplication }); }}
                  >
                    <Droplets className="h-4 w-4" /> Registrar
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}

      {/* ── Cadastro do ponto ── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? `Editar ponto ${editando.code}` : "Novo ponto de lubrificação"}
        size="lg"
        footer={
          <>
            {!editando && (
              <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-graphite-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={continuarNoAtivo}
                  onChange={(e) => setContinuarNoAtivo(e.target.checked)}
                />
                Continuar neste ativo (para lançar o próximo ponto)
              </label>
            )}
            {/* "Concluir" sugeria "salvar e terminar", mas o botao so' fecha o modal sem
                salvar o que estiver preenchido na tela (quem quer salvar tem que clicar em
                "Salvar e adicionar outro", mesmo no ultimo ponto) - armadilha de rotulo do
                mesmo tipo ja achada nesta auditoria (etapa do assistente de plano). Nome
                trocado para deixar claro que fecha sem salvar. */}
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>
              {continuarNoAtivo && !editando ? "Fechar sem salvar" : "Cancelar"}
            </button>
            <button type="submit" form="ponto-form" className="btn-primary" disabled={pointForm.formState.isSubmitting}>
              {pointForm.formState.isSubmitting
                ? "Salvando..."
                : continuarNoAtivo && !editando
                  ? "Salvar e adicionar outro"
                  : "Salvar"}
            </button>
          </>
        }
      >
        <form id="ponto-form" onSubmit={pointForm.handleSubmit(salvarPonto)} className="space-y-4" noValidate>
          <InstrumentPicker
            label="Ativo"
            required
            clientId={clientId}
            error={pointForm.formState.errors.instrumentId?.message}
            {...pointForm.register("instrumentId")}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="Código do ponto"
              placeholder="Preenchido ao escolher o ativo"
              hint="Numerado a partir do TAG do ativo (-PT-01, -PT-02...). Dá para editar; em branco, o sistema numera ao salvar."
              error={pointForm.formState.errors.code?.message}
              {...pointForm.register("code")}
            />
            <TextInput
              label="Nome"
              required
              placeholder="Ex.: Mancal lado acoplamento"
              error={pointForm.formState.errors.name?.message}
              {...pointForm.register("name")}
            />
          </div>
          <TextInput label="Componente" placeholder="Ex.: rolamento, redutor, corrente" {...pointForm.register("component")} />

          <SelectInput
            label="Lubrificante"
            required
            options={opcoesDeLubrificante}
            error={pointForm.formState.errors.lubricantId?.message}
            {...pointForm.register("lubricantId")}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput
              label="Quantidade por aplicação"
              type="number"
              step="any"
              min="0"
              required
              hint="Na unidade da peça do almoxarifado."
              error={pointForm.formState.errors.quantityPerApplication?.message}
              {...pointForm.register("quantityPerApplication")}
            />
            <TextInput
              label="A cada (dias)"
              type="number"
              min="1"
              required
              error={pointForm.formState.errors.frequencyDays?.message}
              {...pointForm.register("frequencyDays")}
            />
            <SelectInput
              label="Método"
              required
              options={Object.entries(METODOS_DE_LUBRIFICACAO).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
              {...pointForm.register("method")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectInput
              label="Estado da máquina"
              required
              hint="Ponto que só pode ser lubrificado parado precisa estar marcado aqui."
              options={Object.entries(ESTADOS_DA_MAQUINA).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
              {...pointForm.register("machineState")}
            />
            <TextInput
              label="Última lubrificação"
              type="date"
              hint="Em branco = o ponto já nasce vencido, para entrar na próxima rota."
              {...pointForm.register("lastLubricatedAt")}
            />
          </div>

          <TextareaInput label="Acesso" rows={2} placeholder="Como chegar ao ponto (plataforma, escada, proteção a remover)" {...pointForm.register("accessNotes")} />
          <TextareaInput label="Segurança" rows={2} placeholder="Bloqueio, EPI, cuidados específicos" {...pointForm.register("safetyNotes")} />
        </form>
      </Modal>

      {/* ── Registro da aplicacao ── */}
      <Modal
        open={!!registrando}
        onClose={() => setRegistrando(null)}
        title={registrando ? `Registrar lubrificação - ${registrando.code}` : ""}
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setRegistrando(null)}>Cancelar</button>
            <button type="submit" form="registro-form" className="btn-primary" disabled={recordForm.formState.isSubmitting}>
              {recordForm.formState.isSubmitting ? "Registrando..." : "Registrar"}
            </button>
          </>
        }
      >
        {registrando && (
          <form id="registro-form" onSubmit={recordForm.handleSubmit(salvarRegistro)} className="space-y-4" noValidate>
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="text-graphite-700">
                {registrando.name} - {registrando.instrument?.tag ?? "sem TAG"}
              </p>
              <p className="text-xs text-graphite-500">
                Especificado: {registrando.quantityPerApplication} {registrando.lubricant?.sparePart.unit} de{" "}
                {registrando.lubricant?.sparePart.name} (saldo {registrando.lubricant?.sparePart.stockQty}{" "}
                {registrando.lubricant?.sparePart.unit})
              </p>
              {registrando.machineState === "STOPPED" && (
                <p className="mt-1 text-xs font-medium text-safety-red">
                  Este ponto só pode ser lubrificado com a máquina parada.
                </p>
              )}
              {registrando.safetyNotes && <p className="mt-1 text-xs text-graphite-600">Segurança: {registrando.safetyNotes}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label={`Quantidade aplicada (${registrando.lubricant?.sparePart.unit ?? ""})`}
                type="number"
                step="any"
                min="0"
                required
                hint="Baixa direto do almoxarifado."
                error={recordForm.formState.errors.quantity?.message}
                {...recordForm.register("quantity")}
              />
              <TextInput label="Data e hora" type="datetime-local" {...recordForm.register("executedAt")} />
            </div>

            <LaborResourcePicker
              label="Quem executou"
              placeholder="Não informado"
              clientId={clientId}
              {...recordForm.register("laborResourceId")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectInput
                label="Condição encontrada"
                placeholder="Não informada"
                options={Object.entries(CONDICOES_DO_PONTO).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
                {...recordForm.register("conditionBefore")}
              />
              <SelectInput
                label="Condição após"
                placeholder="Não informada"
                options={Object.entries(CONDICOES_DO_PONTO).map(([valor, rotulo]) => ({ value: valor, label: rotulo }))}
                {...recordForm.register("conditionAfter")}
              />
            </div>

            <TextareaInput label="Observações" rows={2} {...recordForm.register("notes")} />
          </form>
        )}
      </Modal>
    </div>
  );
}
