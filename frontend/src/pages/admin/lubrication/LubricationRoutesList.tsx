import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, ArrowUp, ArrowDown, X, Wand2, ClipboardList } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput, TextareaInput, SelectInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { listAreas } from "../../../api/areas";
import {
  listLubricationRoutes,
  createLubricationRoute,
  updateLubricationRoute,
  deleteLubricationRoute,
  sugerirPontosDeLubrificacao,
  gerarOrdensDaRota,
} from "../../../api/lubrication";
import type { LubricationRoute, LubricationPoint } from "../../../api/types";
import { LubricationPointPicker } from "../../../components/LubricationPointPicker";
import { LaborResourcePicker } from "../../../components/LaborResourcePicker";
import { useCmms } from "../../../lib/cmms";

const CRITERIOS_AUTO = [
  { value: "VENCIMENTO", label: "Vencimento próximo (data +/- 5 dias)" },
  { value: "AREA", label: "Área" },
  { value: "PARADO", label: "Equipamento parado" },
] as const;
type CriterioAuto = (typeof CRITERIOS_AUTO)[number]["value"];

const schema = z.object({
  name: z.string().min(2, "Informe o nome da rota."),
  code: z.string().optional(),
  responsibleId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/** Rota = a ordem em que o lubrificador percorre os pontos. Ela nao redefine periodicidade
 * nem quantidade: isso e' especificacao de cada ponto. Agrupar aqui e' o que transforma
 * "40 pontos vencidos" em uma volta pela fabrica. */
export default function LubricationRoutesList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { isClient, ownClientId, base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = isClient ? ownClientId ?? "" : searchParams.get("clientId") ?? "";
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<LubricationRoute | null>(null);
  const [pontosDaRota, setPontosDaRota] = useState<string[]>([]);
  // Guarda os dados de cada ponto ja envolvido na rota (editando, sugerido ou escolhido na
  // busca) - so' assim a lista ordenada mostra codigo/nome/TAG sem depender de uma consulta
  // paginada de todos os pontos do cliente, que num parque grande nao teria como trazer
  // tudo de uma vez.
  const [pontosInfo, setPontosInfo] = useState<Map<string, LubricationPoint>>(new Map());
  const [gerandoOsDe, setGerandoOsDe] = useState<string | null>(null);

  // Montagem automatica: a segunda opcao, ao lado de escolher ponto a ponto. So sugere -
  // quem decide o que de fato entra na rota e' a revisao logo abaixo, antes de salvar.
  const [criterioAuto, setCriterioAuto] = useState<CriterioAuto>("VENCIMENTO");
  const [dataReferenciaAuto, setDataReferenciaAuto] = useState(() => new Date().toISOString().slice(0, 10));
  const [areaIdAuto, setAreaIdAuto] = useState("");
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);
  const [sugestoes, setSugestoes] = useState<string[] | null>(null);

  const { data: routes, isLoading } = useQuery({
    queryKey: ["rotas-lubrificacao", clientId],
    queryFn: () => listLubricationRoutes({ clientId }),
    enabled: !!clientId,
  });
  const { data: areas } = useQuery({
    queryKey: ["areas-picker-rota-lubrificacao", clientId],
    queryFn: () => listAreas({ clientId, active: true }),
    enabled: !!clientId && formOpen,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const porId = pontosInfo;

  function abrirNova() {
    setEditando(null);
    setPontosDaRota([]);
    setPontosInfo(new Map());
    setSugestoes(null);
    setAreaIdAuto("");
    reset({ name: "", code: "", responsibleId: "", notes: "" });
    setFormOpen(true);
  }

  function abrirEdicao(r: LubricationRoute) {
    setEditando(r);
    setPontosDaRota((r.items ?? []).map((i) => i.point.id));
    setPontosInfo(new Map((r.items ?? []).map((i) => [i.point.id, i.point])));
    setSugestoes(null);
    setAreaIdAuto(r.areaId ?? "");
    reset({ name: r.name, code: r.code ?? "", responsibleId: r.responsibleId ?? "", notes: r.notes ?? "" });
    setFormOpen(true);
  }

  async function buscarSugestoes() {
    if (!clientId) return;
    if (criterioAuto === "AREA" && !areaIdAuto) {
      notify("error", "Escolha uma área.");
      return;
    }
    setBuscandoSugestoes(true);
    try {
      const pontos = await sugerirPontosDeLubrificacao({
        clientId,
        criterio: criterioAuto,
        ...(criterioAuto === "VENCIMENTO" ? { dataReferencia: dataReferenciaAuto } : {}),
        ...(criterioAuto === "AREA" ? { areaId: areaIdAuto } : {}),
      });
      setSugestoes(pontos.map((p) => p.id));
      setPontosInfo((atual) => {
        const novo = new Map(atual);
        pontos.forEach((p) => novo.set(p.id, p));
        return novo;
      });
      if (pontos.length === 0) notify("error", "Nenhum ponto encontrado para esse critério.");
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBuscandoSugestoes(false);
    }
  }

  function adicionarSugeridos() {
    if (!sugestoes) return;
    setPontosDaRota((atual) => [...atual, ...sugestoes.filter((id) => !atual.includes(id))]);
    setSugestoes(null);
  }

  async function handleGerarOs(r: LubricationRoute) {
    setGerandoOsDe(r.id);
    try {
      const resultado = await gerarOrdensDaRota(r.id);
      if (resultado.geradas.length > 0) {
        notify("success", `OS geradas: ${resultado.geradas.map((g) => g.number).join(", ")}.`);
      }
      if (resultado.puladas.length > 0) {
        notify("error", resultado.puladas.map((p) => p.motivo).join(" "));
      }
      if (resultado.geradas.length === 0 && resultado.puladas.length === 0) {
        notify("error", "Não há pontos na rota para gerar OS.");
      }
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setGerandoOsDe(null);
    }
  }

  function mover(index: number, delta: number) {
    const destino = index + delta;
    if (destino < 0 || destino >= pontosDaRota.length) return;
    const copia = [...pontosDaRota];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    setPontosDaRota(copia);
  }

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        clientId,
        code: values.code || null,
        responsibleId: values.responsibleId || null,
        notes: values.notes || null,
        pointIds: pontosDaRota,
      };
      if (editando) await updateLubricationRoute(editando.id, payload);
      else await createLubricationRoute(payload);
      notify("success", editando ? "Rota atualizada." : "Rota criada.");
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: ["rotas-lubrificacao"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function remover(r: LubricationRoute) {
    try {
      await deleteLubricationRoute(r.id);
      notify("success", "Rota removida.");
      queryClient.invalidateQueries({ queryKey: ["rotas-lubrificacao"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <div>
      <PageHeader
        title="Rotas de lubrificação"
        description="A ordem em que o lubrificador percorre os pontos"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Lubrificação", to: `${base}/lubrificacao` },
          { label: "Rotas" },
        ]}
        actions={
          <button className="btn-primary" onClick={abrirNova} disabled={!clientId}>
            <Plus className="h-4 w-4" /> Nova rota
          </button>
        }
      />

      {!isClient && (
        <div className="mb-6">
          <ClientFilterSelect
            className="sm:w-72"
            value={clientId}
            onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
            service="CMMS_MAINTENANCE"
            allLabel="Selecione o cliente"
          />
        </div>
      )}

      {!clientId ? (
        <EmptyState title="Selecione o cliente" description="As rotas são da fábrica de cada empresa." />
      ) : isLoading ? (
        <p className="text-sm text-graphite-500">Carregando...</p>
      ) : (routes ?? []).length === 0 ? (
        <EmptyState
          title="Nenhuma rota criada"
          description="Uma rota agrupa os pontos numa sequência de campo - é o que o plano de lubrificação agenda para virar OS."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(routes ?? []).map((r) => {
            const consumoPorVolta = (r.items ?? []).reduce<Record<string, { qtd: number; unidade: string }>>((acc, item) => {
              const lub = item.point.lubricant;
              if (!lub) return acc;
              const atual = acc[lub.sparePart.name] ?? { qtd: 0, unidade: lub.sparePart.unit };
              atual.qtd += item.point.quantityPerApplication;
              acc[lub.sparePart.name] = atual;
              return acc;
            }, {});

            return (
              <div key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-navy-900">{r.name}</h2>
                    <p className="text-xs text-graphite-500">
                      {[r.code, r.responsible?.name].filter(Boolean).join(" - ") || "sem responsável definido"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => handleGerarOs(r)}
                      disabled={gerandoOsDe === r.id || (r.items ?? []).length === 0}
                      title="Gera uma OS de lubrificação por ativo da rota, para acompanhamento e rastreio"
                    >
                      <ClipboardList className="h-4 w-4" /> {gerandoOsDe === r.id ? "Gerando..." : "Gerar OS"}
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => abrirEdicao(r)}>Editar</button>
                    <button className="btn-ghost btn-sm text-safety-red" onClick={() => remover(r)}>Remover</button>
                  </div>
                </div>

                <p className="mt-3 text-sm text-graphite-700">{(r.items ?? []).length} ponto(s)</p>
                {Object.keys(consumoPorVolta).length > 0 && (
                  <div className="mt-1 text-xs text-graphite-500">
                    Consumo por volta:{" "}
                    {Object.entries(consumoPorVolta)
                      .map(([nome, v]) => `${Number(v.qtd.toFixed(3))} ${v.unidade} de ${nome}`)
                      .join("; ")}
                  </div>
                )}

                {(r.items ?? []).length > 0 && (
                  <ol className="mt-3 space-y-1 text-sm text-graphite-700">
                    {(r.items ?? []).map((item, i) => (
                      <li key={item.id} className="flex gap-2">
                        <span className="text-graphite-400">{i + 1}.</span>
                        <span className="min-w-0">
                          {item.point.code} - {item.point.name}
                          <span className="text-graphite-400"> ({item.point.instrument?.tag ?? "sem TAG"})</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? `Editar rota ${editando.name}` : "Nova rota de lubrificação"}
        size="lg"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button type="submit" form="rota-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="rota-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Nome da rota" required placeholder="Ex.: Rota semanal - Linha 4" error={errors.name?.message} {...register("name")} />
            <TextInput label="Código" placeholder="Ex.: ROT-L4-SEM" {...register("code")} />
          </div>
          <LaborResourcePicker
            label="Responsável"
            placeholder="A definir"
            clientId={clientId}
            {...register("responsibleId")}
          />
          <TextareaInput label="Observações" rows={2} {...register("notes")} />

          <div className="rounded-lg border border-gray-200 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-graphite-700">
              <Wand2 className="h-4 w-4 text-navy-600" /> Montagem automática
            </p>
            <p className="mb-3 mt-0.5 text-xs text-graphite-500">
              Sugere os pontos por um critério - só entram na rota depois de confirmados abaixo. A montagem manual
              (adicionar ponto a ponto) continua disponível logo depois.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <SelectInput
                label="Critério"
                options={CRITERIOS_AUTO.map((c) => ({ value: c.value, label: c.label }))}
                value={criterioAuto}
                onChange={(e) => { setCriterioAuto(e.target.value as CriterioAuto); setSugestoes(null); }}
              />
              {criterioAuto === "VENCIMENTO" && (
                <TextInput
                  label="Data de referência"
                  type="date"
                  hint="Junta quem vence 5 dias antes ou depois desta data."
                  value={dataReferenciaAuto}
                  onChange={(e) => setDataReferenciaAuto(e.target.value)}
                />
              )}
              {criterioAuto === "AREA" && (
                <SelectInput
                  label="Área"
                  placeholder="Selecione a área"
                  options={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))}
                  value={areaIdAuto}
                  onChange={(e) => setAreaIdAuto(e.target.value)}
                />
              )}
              <div className="flex items-end">
                <button type="button" className="btn-outline w-full" onClick={buscarSugestoes} disabled={buscandoSugestoes}>
                  {buscandoSugestoes ? "Buscando..." : "Buscar pontos"}
                </button>
              </div>
            </div>

            {sugestoes && sugestoes.length > 0 && (
              <div className="mt-3 rounded-lg bg-gray-50 p-3">
                <p className="mb-1 text-xs font-medium text-graphite-600">{sugestoes.length} ponto(s) encontrado(s):</p>
                <ul className="mb-2 space-y-0.5 text-xs text-graphite-600">
                  {sugestoes.map((id) => {
                    const p = porId.get(id);
                    return (
                      <li key={id}>
                        {p ? `${p.code} - ${p.name} (${p.instrument?.tag ?? "sem TAG"})` : id}
                        {p && pontosDaRota.includes(id) ? " - já está na rota" : ""}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn-primary btn-sm" onClick={adicionarSugeridos}>
                  Adicionar {sugestoes.length} ponto(s) à rota
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-graphite-700">Pontos da rota, na ordem de execução</p>
            <p className="mb-2 text-xs text-graphite-500">
              A ordem é a sequência de caminhada na fábrica - é ela que economiza o tempo do lubrificador.
            </p>

            {pontosDaRota.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-graphite-500">Nenhum ponto na rota ainda.</p>
            ) : (
              <ol className="space-y-1">
                {pontosDaRota.map((id, index) => {
                  const p = porId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="w-5 shrink-0 text-graphite-400">{index + 1}.</span>
                      <span className="min-w-0 flex-1 truncate text-graphite-800">
                        {p ? `${p.code} - ${p.name}` : id}
                        {p?.instrument?.tag ? <span className="text-graphite-400"> ({p.instrument.tag})</span> : null}
                      </span>
                      <button type="button" className="text-graphite-400 hover:text-navy-700" onClick={() => mover(index, -1)} aria-label="Subir">
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button type="button" className="text-graphite-400 hover:text-navy-700" onClick={() => mover(index, 1)} aria-label="Descer">
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="text-graphite-400 hover:text-safety-red"
                        onClick={() => setPontosDaRota((atual) => atual.filter((x) => x !== id))}
                        aria-label="Remover da rota"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            <div className="mt-2">
              <LubricationPointPicker
                clientId={clientId}
                placeholder="Adicionar ponto..."
                excludeIds={pontosDaRota}
                onSelect={(p) => {
                  setPontosDaRota((atual) => [...atual, p.id]);
                  setPontosInfo((atual) => new Map(atual).set(p.id, p));
                }}
              />
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
