import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { listSpareParts, createSparePart, addSparePartMovement, getSparePartAlerts, getSparePartHistory } from "../../../api/spareParts";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import type { SparePart } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { DataTable } from "../../../components/DataTable";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { formatCurrency, formatDate, formatDateTime } from "../../../lib/format";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Informe o nome da peca."),
  code: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().optional(),
  minStock: z.coerce.number().int().nonnegative().optional(),
  unitCost: numeroOpcional(z.coerce.number().nonnegative()),
});
type FormValues = z.infer<typeof schema>;

export default function SparePartsList() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [historicoDe, setHistoricoDe] = useState<SparePart | null>(null);
  // window.prompt() encadeado (quantidade, depois custo) e' o mesmo dialogo nativo
  // bloqueante que ja tinha travado a sessao noutros dois fluxos desta auditoria (consumir
  // reserva, gerar OS antes da antecedencia) - so que aqui ninguem tinha reproduzido ainda
  // (achado nesta varredura). Substituido por um Modal do proprio app.
  const [movimento, setMovimento] = useState<{ part: SparePart; type: "IN" | "OUT" } | null>(null);
  const [quantidadeMovimento, setQuantidadeMovimento] = useState("");
  const [custoMovimento, setCustoMovimento] = useState("");
  const [salvandoMovimento, setSalvandoMovimento] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["spare-parts", clientId, search, page],
    queryFn: () => listSpareParts({ clientId, search: search || undefined, page, pageSize: 15 }),
    enabled: !!clientId,
  });

  const { data: alertas } = useQuery({
    queryKey: ["spare-part-alerts", clientId],
    queryFn: () => getSparePartAlerts({ clientId }),
    enabled: !!clientId,
  });

  const { data: historico } = useQuery({
    queryKey: ["spare-part-history", historicoDe?.id],
    queryFn: () => getSparePartHistory(historicoDe!.id),
    enabled: !!historicoDe,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { unit: "un" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await createSparePart({ ...values, clientId, unitCost: values.unitCost ?? null });
      notify("success", "Peca cadastrada no almoxarifado.");
      reset({ unit: "un" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  function handleMovement(part: SparePart, type: "IN" | "OUT") {
    setMovimento({ part, type });
    setQuantidadeMovimento("");
    setCustoMovimento(type === "IN" && part.unitCost != null ? String(part.unitCost) : "");
  }

  async function submitMovimento() {
    if (!movimento) return;
    const quantidade = Math.trunc(Number(quantidadeMovimento));
    if (!quantidadeMovimento || Number.isNaN(quantidade) || quantidade <= 0) {
      notify("error", "Informe uma quantidade valida (maior que zero).");
      return;
    }
    const unitCost = movimento.type === "IN" && custoMovimento && !Number.isNaN(Number(custoMovimento)) && Number(custoMovimento) >= 0
      ? Number(custoMovimento)
      : undefined;
    setSalvandoMovimento(true);
    try {
      await addSparePartMovement(movimento.part.id, { type: movimento.type, quantity: quantidade, unitCost });
      notify("success", "Estoque atualizado.");
      setMovimento(null);
      queryClient.invalidateQueries({ queryKey: ["spare-parts"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSalvandoMovimento(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Almoxarifado"
        description="Estoque de pecas de manutencao do cliente (rolamentos, retentores, disjuntores...) - cada empresa tem o seu almoxarifado"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: "/gestao/manutencao" }, { label: "Almoxarifado" }]}
        actions={
          clientId && (
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Nova peca
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <ClientFilterSelect
          className="sm:w-72"
          value={clientId}
          onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
          service="CMMS_MAINTENANCE"
          allLabel="Selecione o cliente"
        />
        {clientId && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, codigo ou categoria..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        )}
      </div>

      {!clientId ? (
        <EmptyState title="Selecione um cliente" description="O almoxarifado e' proprio de cada empresa - escolha uma acima para ver as pecas dela." />
      ) : (
        <>
          {/* Alertas primeiro. Sao tres consultas que ninguem cruzava a mao, e o resultado
              delas e' o que faz uma preventiva parar na porta do almoxarifado. */}
          {alertas && (alertas.totais.abaixoDoMinimo > 0 || alertas.totais.osComFalta > 0 || alertas.totais.reservasFuturas > 0) && (
            <div className="mb-5 space-y-3">
              {alertas.osComMaterialFaltando.length > 0 && (
                <div className="card border-safety-red/30 bg-red-50/40 p-4">
                  <p className="flex items-center gap-2 font-semibold text-safety-red">
                    <AlertTriangle className="h-4 w-4" />
                    {alertas.totais.osComFalta} OS sem material
                    {alertas.totais.osAtrasadasComFalta > 0 && ` (${alertas.totais.osAtrasadasComFalta} ja atrasada${alertas.totais.osAtrasadasComFalta > 1 ? "s" : ""})`}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {alertas.osComMaterialFaltando.slice(0, 6).map((os) => (
                      <li key={os.id}>
                        <Link to={`/gestao/manutencao/ordens/${os.id}`} className="font-medium text-navy-800 hover:underline">
                          {os.number}
                        </Link>{" "}
                        <span className="text-graphite-700">{os.title ?? ""}</span>
                        <span className="text-graphite-500">
                          {" - falta "}
                          {os.faltando.map((f) => `${f.falta} ${f.unidade} de ${f.nome}`).join("; ")}
                          {os.scheduledDate && ` (programada para ${formatDate(os.scheduledDate)})`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                {alertas.abaixoDoMinimo.length > 0 && (
                  <div className="card border-safety-yellow/40 p-4">
                    <p className="font-semibold text-safety-yellow-dark">{alertas.totais.abaixoDoMinimo} peca(s) abaixo do minimo</p>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-graphite-700">
                      {alertas.abaixoDoMinimo.slice(0, 6).map((peca) => (
                        <li key={peca.id}>
                          {peca.name}: {peca.stockQty} {peca.unit}{" "}
                          <span className="text-graphite-500">(min. {peca.minStock} - repor {peca.faltaParaOMinimo})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {alertas.reservadoParaOsFutura.length > 0 && (
                  <div className="card p-4">
                    <p className="font-semibold text-navy-900">{alertas.totais.reservasFuturas} reserva(s) para OS futura</p>
                    <p className="text-xs text-graphite-500">O saldo existe, mas ja tem dono.</p>
                    <ul className="mt-1.5 space-y-0.5 text-sm text-graphite-700">
                      {alertas.reservadoParaOsFutura.slice(0, 6).map((r) => (
                        <li key={r.reservationId}>
                          {r.quantity} {r.sparePart.unit} de {r.sparePart.name} para{" "}
                          <Link to={`/gestao/manutencao/ordens/${r.workOrder.id}`} className="font-medium text-navy-800 hover:underline">
                            {r.workOrder.number}
                          </Link>
                          {r.workOrder.scheduledDate && ` (${formatDate(r.workOrder.scheduledDate)})`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {data && data.items.some((p) => p.unitCost != null) && (
            <p className="mb-3 text-sm text-graphite-600">
              Valor do estoque desta pagina:{" "}
              <span className="font-semibold text-navy-900">
                {formatCurrency(data.items.reduce((sum, p) => sum + (p.unitCost ?? 0) * p.stockQty, 0))}
              </span>
            </p>
          )}
          <DataTable
          loading={isLoading}
          rows={data?.items ?? []}
          keyField={(p) => p.id}
          pagination={data}
          onPageChange={setPage}
          emptyTitle="Nenhuma peca cadastrada no almoxarifado deste cliente"
          columns={[
            {
              header: "Peca",
              accessor: (p) => (
                <div>
                  <span className="font-medium text-navy-900">{p.name}</span>
                  {p.code && <span className="ml-2 font-mono text-xs text-graphite-400">{p.code}</span>}
                </div>
              ),
            },
            { header: "Categoria", accessor: (p) => p.category ?? "-" },
            {
              header: "Estoque",
              accessor: (p) => (
                <span className={`flex items-center gap-1.5 font-medium ${p.stockQty <= p.minStock ? "text-safety-red" : "text-graphite-800"}`}>
                  {p.stockQty <= p.minStock && <AlertTriangle className="h-3.5 w-3.5" />}
                  {p.stockQty} {p.unit} {p.minStock > 0 && <span className="text-xs text-graphite-400">(min. {p.minStock})</span>}
                </span>
              ),
            },
            {
              header: "Reservado",
              accessor: (p) => (p.reservedQty > 0 ? <span className="text-safety-yellow-dark">{p.reservedQty} {p.unit} <span className="text-xs text-graphite-400">(disp.: {p.stockQty - p.reservedQty})</span></span> : "-"),
            },
            {
              header: "Custo unit.",
              accessor: (p) => (p.unitCost != null ? formatCurrency(p.unitCost) : "-"),
            },
            {
              header: "Valor em estoque",
              accessor: (p) => (p.unitCost != null ? formatCurrency(p.unitCost * p.stockQty) : "-"),
            },
            {
              header: "Historico",
              accessor: (p) => (
                <button
                  type="button"
                  className="text-xs font-medium text-navy-700 hover:underline"
                  onClick={() => setHistoricoDe(p)}
                >
                  Ver
                </button>
              ),
            },
            {
              header: "Movimentar",
              accessor: (p) => (
                <div className="flex gap-2">
                  <button onClick={() => handleMovement(p, "IN")} className="text-graphite-400 hover:text-safety-green" title="Entrada" aria-label="Registrar entrada">
                    <ArrowDownCircle className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleMovement(p, "OUT")} className="text-graphite-400 hover:text-safety-red" title="Saida" aria-label="Registrar saida">
                    <ArrowUpCircle className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]}
          />
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nova peca do almoxarifado"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setCreateOpen(false)}>Cancelar</button>
            <button type="submit" form="spare-part-form" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <form id="spare-part-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput label="Nome" required placeholder="Ex.: Rolamento 6205" error={errors.name?.message} {...register("name")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Codigo (opcional)" placeholder="Ex.: ROL-6205" {...register("code")} />
            <TextInput label="Categoria (opcional)" placeholder="Ex.: Rolamentos" {...register("category")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Unidade" {...register("unit")} />
            <TextInput label="Estoque minimo" type="number" {...register("minStock")} />
          </div>
          <TextInput
            label="Custo unitario (opcional)"
            type="number"
            step="any"
            hint="So alimenta o valor do estoque quando preenchido - pode deixar em branco."
            {...register("unitCost")}
          />
        </form>
      </Modal>
      <Modal
        open={!!historicoDe}
        onClose={() => setHistoricoDe(null)}
        title={historicoDe ? `Historico - ${historicoDe.name}` : ""}
        size="lg"
        footer={<button type="button" className="btn-outline" onClick={() => setHistoricoDe(null)}>Fechar</button>}
      >
        {/* Entrada, saida, ajuste, reserva, consumo e devolucao no mesmo fio. Antes a tela
            mostrava so os movimentos, e quem procurava "onde foram parar 4 rolamentos" nao
            via a reserva que os prendeu. */}
        {!historico ? (
          <p className="text-sm text-graphite-500">Carregando...</p>
        ) : historico.eventos.length === 0 ? (
          <p className="text-sm text-graphite-500">Nenhuma movimentacao registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {historico.eventos.map((e, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TOM_DO_EVENTO[e.tipo]}`}>
                    {ROTULO_DO_EVENTO[e.tipo]}
                  </span>
                  <span className="ml-2 font-medium text-navy-900">
                    {e.quantidade} {historico.sparePart.unit}
                  </span>
                  {e.observacao && <p className="mt-0.5 text-xs text-graphite-500">{e.observacao}</p>}
                </div>
                <div className="shrink-0 text-right text-xs text-graphite-500">
                  <p>{formatDateTime(e.quando)}</p>
                  <p>{e.usuario ?? "sem usuario registrado"}</p>
                  {e.custoUnitario != null && <p>{formatCurrency(e.custoUnitario)} / un.</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={!!movimento}
        onClose={() => setMovimento(null)}
        title={movimento ? `${movimento.type === "IN" ? "Entrada" : "Saida"} - ${movimento.part.name}` : ""}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setMovimento(null)}>Cancelar</button>
            <button type="button" className="btn-primary" disabled={salvandoMovimento} onClick={submitMovimento}>
              {salvandoMovimento ? "Salvando..." : "Confirmar"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-graphite-600">
            Saldo atual: {movimento?.part.stockQty} {movimento?.part.unit}
          </p>
          <TextInput
            label="Quantidade"
            required
            type="number"
            min={1}
            value={quantidadeMovimento}
            onChange={(e) => setQuantidadeMovimento(e.target.value)}
          />
          {movimento?.type === "IN" && (
            <TextInput
              label="Custo unitario desta compra (opcional)"
              type="number"
              step="any"
              value={custoMovimento}
              onChange={(e) => setCustoMovimento(e.target.value)}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

const ROTULO_DO_EVENTO: Record<string, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saida",
  AJUSTE: "Ajuste",
  RESERVA: "Reserva",
  CONSUMO: "Consumo",
  DEVOLUCAO: "Devolucao",
};

const TOM_DO_EVENTO: Record<string, string> = {
  ENTRADA: "border-green-200 bg-green-50 text-safety-green-dark",
  SAIDA: "border-red-200 bg-red-50 text-safety-red",
  AJUSTE: "border-gray-200 bg-gray-50 text-graphite-600",
  RESERVA: "border-yellow-200 bg-yellow-50 text-safety-yellow-dark",
  CONSUMO: "border-navy-200 bg-navy-50 text-navy-700",
  DEVOLUCAO: "border-green-200 bg-green-50 text-safety-green-dark",
};
