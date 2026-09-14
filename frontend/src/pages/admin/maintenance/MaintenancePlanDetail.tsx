import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, PlayCircle, Copy, PauseCircle, CheckCircle2, Wrench, X } from "lucide-react";
import {
  getMaintenancePlan,
  deleteMaintenancePlan,
  generateWorkOrderFromPlan,
  getMaintenancePlanIndicators,
  duplicateMaintenancePlan,
  updateMaintenancePlan,
  atribuirAtivosAoPlano,
} from "../../../api/maintenancePlans";
import { getInstrument } from "../../../api/instruments";
import type { MaintenancePlan } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { EmptyState } from "../../../components/EmptyState";
import { Modal } from "../../../components/Modal";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { useCmms } from "../../../lib/cmms";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { clientDisplayName, formatDate, formatCurrency } from "../../../lib/format";

export default function MaintenancePlanDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const { canManage, isClient, base } = useCmms();
  const queryClient = useQueryClient();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [atribuirOpen, setAtribuirOpen] = useState(false);
  // window.confirm() e' um dialogo nativo bloqueante - o mesmo padrao que ja tinha travado a
  // sessao ao consumir uma reserva de material (window.prompt) e voltou a travar aqui ao
  // gerar OS antes da antecedencia configurada (achado em reavaliacao: clique em "Gerar OS"
  // parou de responder e nenhuma aba nova abria). Substituido por confirmacao no proprio app.
  const [confirmAntecipar, setConfirmAntecipar] = useState<string | null>(null);

  const { data: plan, isLoading } = useQuery({ queryKey: ["maintenance-plan", id], queryFn: () => getMaintenancePlan(id) });
  const { data: indicators } = useQuery({
    queryKey: ["maintenance-plan-indicators", id],
    queryFn: () => getMaintenancePlanIndicators(id),
  });

  async function handleStatus(status: "ACTIVE" | "SUSPENDED" | "CLOSED", mensagem: string) {
    setBusy(true);
    try {
      await updateMaintenancePlan(id, { status });
      notify("success", mensagem);
      queryClient.invalidateQueries({ queryKey: ["maintenance-plan", id] });
      queryClient.invalidateQueries({ queryKey: ["maintenance-plan-indicators", id] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const copia = await duplicateMaintenancePlan(id);
      notify("success", `Plano ${copia.code ?? ""} criado como cópia - ajuste e ative quando quiser.`);
      navigate(`${base}/planos/${copia.id}`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteMaintenancePlan(id);
      notify("success", "Plano removido.");
      navigate(`${base}/planos`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerate(forcar = false) {
    setGenerating(true);
    try {
      const workOrder = await generateWorkOrderFromPlan(id, forcar);
      notify("success", `OS ${workOrder.number} gerada.`);
      navigate(`${base}/ordens/${workOrder.id}`);
    } catch (error) {
      const mensagem = getApiErrorMessage(error);
      // O backend recusa antecipar a geracao antes da antecedencia configurada. Em vez de
      // so mostrar o erro, oferece a antecipacao explicita - que e' uma decisao legitima
      // do planejador, desde que consciente.
      if (!forcar && mensagem.includes("geracao forcada")) {
        setConfirmAntecipar(mensagem);
        return;
      }
      notify("error", mensagem);
    } finally {
      setGenerating(false);
    }
  }

  if (isLoading || !plan) return <FullPageSpinner />;

  const due = plan.derivedStatus === "DUE_SOON" || plan.derivedStatus === "EXPIRED";

  return (
    <div>
      <PageHeader
        title={plan.name}
        description={isClient ? `Ativo: ${plan.instrument?.tag ?? "-"}` : `Cliente: ${clientDisplayName(plan.client)} - Ativo: ${plan.instrument?.tag ?? "-"}`}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Planos", to: `${base}/planos` },
          { label: plan.name },
        ]}
        actions={
          canManage && (
            <>
              {due && plan.status === "ACTIVE" && (
                <button
                  className="btn-primary"
                  onClick={() => handleGenerate()}
                  disabled={generating || !plan.instrumentId}
                  title={!plan.instrumentId ? "Escolha um ativo antes de gerar a OS." : undefined}
                >
                  <PlayCircle className="h-4 w-4" /> {generating ? "Gerando..." : "Gerar OS"}
                </button>
              )}
              <button className="btn-outline" onClick={() => navigate(`${base}/planos/${id}/editar`)}>
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button className="btn-outline" onClick={handleDuplicate} disabled={busy}>
                <Copy className="h-4 w-4" /> Duplicar
              </button>
              {plan.status === "ACTIVE" ? (
                <button className="btn-outline" onClick={() => handleStatus("SUSPENDED", "Plano suspenso - para de gerar OS.")} disabled={busy}>
                  <PauseCircle className="h-4 w-4" /> Suspender
                </button>
              ) : plan.status !== "CLOSED" ? (
                <button className="btn-outline" onClick={() => handleStatus("ACTIVE", "Plano reativado.")} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Reativar
                </button>
              ) : null}
              <button className="btn-danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-4 w-4" /> Remover
              </button>
            </>
          )
        }
      />

      {!plan.instrumentId && canManage && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 px-4 py-3">
          <p className="text-sm text-graphite-700">
            Este plano ainda não tem ativo - a OS só pode ser gerada depois de atribuir um ou mais.
          </p>
          <button className="btn-outline text-sm" onClick={() => setAtribuirOpen(true)}>
            <Wrench className="h-4 w-4" /> Atribuir ativos
          </button>
        </div>
      )}

      {indicators && (
        <div className="mb-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <IndicadorCard
              rotulo="Cumprimento do plano"
              valor={indicators.compliancePct != null ? `${indicators.compliancePct}%` : "Dados insuficientes"}
              detalhe={
                indicators.totals.completed > 0
                  ? `${indicators.totals.completed} OS concluída(s)`
                  : "Nenhuma OS concluída ainda"
              }
            />
            <IndicadorCard
              rotulo="Atrasadas"
              valor={String(indicators.totals.overdue)}
              detalhe={`${indicators.totals.open} em aberto`}
              alerta={indicators.totals.overdue > 0}
            />
            <IndicadorCard
              rotulo="HH planejada x realizada"
              valor={
                indicators.laborHours.actual != null
                  ? `${indicators.laborHours.planned ?? "-"}h / ${indicators.laborHours.actual}h`
                  : "Sem apontamento"
              }
            />
            <IndicadorCard
              rotulo="Falhas achadas na preventiva"
              valor={String(indicators.failuresFound)}
              detalhe="Corretivas abertas por anomalia"
              alerta={indicators.failuresFound > 0}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <IndicadorCard rotulo="Última execução" valor={formatDate(indicators.lastExecutionAt) || "Nunca executado"} />
            <IndicadorCard rotulo="Próxima geração da OS" valor={formatDate(indicators.nextGenerationDate) || "-"} />
            <IndicadorCard rotulo="Próximo vencimento" valor={formatDate(indicators.nextDueDate) || "-"} />
          </div>
          {/* Memoria de calculo: sem ver data-base, periodicidade e ajustes um vencimento
              correto pode parecer errado (mes nao tem 30 dias fixos, antecedencia de geracao
              e vencimento sao datas diferentes de proposito) - achado em reavaliacao. */}
          {indicators.nextDueBreakdown && (
            <p className="-mt-2 text-xs text-graphite-500">{indicators.nextDueBreakdown}</p>
          )}

          <div className="card p-5">
            <h2 className="mb-3 font-semibold text-navy-900">Custo planejado x realizado</h2>
            {indicators.cost.tracked ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-graphite-400">Peças</dt><dd className="font-medium">{formatCurrency(indicators.cost.parts)}</dd></div>
                <div><dt className="text-xs text-graphite-400">Mao de obra</dt><dd className="font-medium">{formatCurrency(indicators.cost.labor)}</dd></div>
                <div><dt className="text-xs text-graphite-400">Terceiros</dt><dd className="font-medium">{formatCurrency(indicators.cost.thirdParty)}</dd></div>
                <div><dt className="text-xs text-graphite-400">Total realizado</dt><dd className="font-semibold text-navy-900">{formatCurrency(indicators.cost.total)}</dd></div>
              </dl>
            ) : (
              <p className="text-sm text-graphite-500">
                Sem OS concluida com custo apontado - o custo aparece quando a primeira execucao for encerrada.
              </p>
            )}

            {/* Planejado ao lado do realizado. So material entra no planejado: o plano
                guarda a HH prevista, mas nao um valor/hora - e uma taxa media inventada
                faria a comparacao confrontar um numero medido com um chute. */}
            <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
              {indicators.cost.plannedPerCycle != null ? (
                <>
                  <p className="text-graphite-700">
                    Material previsto por execucao: <span className="font-semibold text-navy-900">{formatCurrency(indicators.cost.plannedPerCycle)}</span>
                  </p>
                  {/* So compara acumulado com realizado quando ha pelo menos uma OS concluida -
                      antes disso o acumulado e' sempre zero e "R$ 0,00 previsto" ao lado de um
                      custo por execucao diferente de zero lia como contradicao. */}
                  {indicators.cost.planned != null && indicators.cost.tracked && (
                    <p className="mt-1 text-graphite-700">
                      Planejado acumulado ({indicators.totals.completed}x): <span className="font-semibold text-navy-900">{formatCurrency(indicators.cost.planned)}</span>
                      {" x realizado em pecas: "}
                      <span className="font-semibold text-navy-900">{formatCurrency(indicators.cost.parts)}</span>
                    </p>
                  )}
                  <p className="mt-1 text-xs text-graphite-500">
                    O planejado cobre so o material previsto. Mao de obra planejada aparece em horas no cartao
                    "HH planejada x realizada" - o plano nao guarda valor/hora.
                  </p>
                </>
              ) : (
                <p className="text-xs text-graphite-500">
                  Sem custo planejado: o plano nao tem material previsto, ou alguma peca esta sem custo unitario
                  cadastrado no almoxarifado.
                </p>
              )}
            </div>
            {indicators.materialUsage.length > 0 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs uppercase tracking-wide text-graphite-400">Consumo de material acumulado</p>
                <ul className="divide-y divide-gray-100 text-sm">
                  {indicators.materialUsage.map((m) => (
                    <li key={m.name} className="flex justify-between py-1.5">
                      <span className="text-graphite-700">{m.name}</span>
                      <span className="font-medium text-navy-900">{m.quantity} {m.unit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card space-y-4 p-5 lg:col-span-2">
          <div className="flex items-center gap-2">
            <StatusBadge status={plan.active ? (plan.derivedStatus ?? "VALID") : "INACTIVE"} />
            {plan.description && <span className="text-sm text-graphite-500">{plan.description}</span>}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Disparo" value={plan.triggerType === "TIME" ? `A cada ${plan.frequencyDays} dias` : `Medidor: ${plan.meter?.name ?? "-"} (a cada ${plan.meterInterval} ${plan.meter?.unit ?? ""})`} />
            <Info label="Próximo vencimento" value={plan.triggerType === "TIME" ? formatDate(plan.nextDueDate) : "-"} />
            <Info label="Última geração" value={formatDate(plan.lastGeneratedAt)} />
            <Info label="Responsável" value={plan.responsible?.name ?? "-"} />
            <Info
              label="Tolerância"
              value={plan.toleranceDaysBefore == null && plan.toleranceDaysAfter == null ? "-" : `${plan.toleranceDaysBefore ?? 0} dias antes / ${plan.toleranceDaysAfter ?? 0} dias depois`}
            />
            <Info label="HH prevista" value={plan.estimatedLaborHours != null ? `${plan.estimatedLaborHours}h` : "-"} />
            {plan.template && (
              <Info label="Modelo de origem" value={plan.template.name} />
            )}
          </dl>

          {plan.procedure && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-graphite-400">Procedimento</p>
              <p className="whitespace-pre-line text-sm text-graphite-700">{plan.procedure}</p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-graphite-400">Checklist padrão</p>
            {plan.checklistTemplate.length === 0 ? (
              <p className="text-sm text-graphite-500">Nenhum item cadastrado.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm text-graphite-700">
                {plan.checklistTemplate.map((c, i) => (
                  <li key={c.id ?? i}>{c.description}</li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-graphite-400">Materiais previstos</p>
            {!plan.parts || plan.parts.length === 0 ? (
              <p className="text-sm text-graphite-500">Nenhum material previsto.</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-sm">
                {plan.parts.map((p, i) => (
                  <li key={p.id ?? i} className="flex items-center justify-between py-1.5">
                    <span className="text-graphite-700">{p.sparePart?.name ?? "-"}{p.sparePart?.code ? ` (${p.sparePart.code})` : ""}</span>
                    <span className="font-medium text-navy-900">{p.quantity} {p.sparePart?.unit ?? "un"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold text-navy-900">Ordens geradas</h2>
          {!plan.workOrders || plan.workOrders.length === 0 ? (
            <EmptyState title="Nenhuma OS gerada" description="Ainda não foi gerada nenhuma ordem a partir deste plano." />
          ) : (
            <ul className="divide-y divide-gray-100">
              {plan.workOrders.map((w) => (
                <li key={w.id}>
                  <Link to={`${base}/ordens/${w.id}`} className="flex items-center justify-between py-2.5 text-sm hover:text-navy-700">
                    <span className="font-medium text-graphite-800">{w.number}</span>
                    <StatusBadge status={w.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Remover plano de manutenção"
        description="Tem certeza que deseja remover este plano? O histórico de ordens de manutenção geradas será preservado."
        confirmLabel="Remover"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={confirmAntecipar != null}
        title="Antecipar geração da OS"
        description={`${confirmAntecipar ?? ""} Gerar a OS agora mesmo assim?`}
        confirmLabel="Gerar mesmo assim"
        loading={generating}
        onConfirm={() => {
          setConfirmAntecipar(null);
          handleGenerate(true);
        }}
        onCancel={() => setConfirmAntecipar(null)}
      />

      {atribuirOpen && (
        <AtribuirAtivosModal
          plan={plan}
          onClose={() => setAtribuirOpen(false)}
          onAtribuido={(total) => {
            setAtribuirOpen(false);
            notify(
              "success",
              total > 1
                ? `Atribuído a ${total} ativos - ${total - 1} plano(s) a mais criado(s) com a mesma configuração.`
                : "Ativo atribuído ao plano.",
            );
            queryClient.invalidateQueries({ queryKey: ["maintenance-plan", id] });
            queryClient.invalidateQueries({ queryKey: ["maintenance-plans"] });
          }}
        />
      )}
    </div>
  );
}

function IndicadorCard({
  rotulo,
  valor,
  detalhe,
  alerta,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  alerta?: boolean;
}) {
  return (
    <div className={`card p-5 ${alerta ? "border-safety-yellow/40 bg-amber-50/30" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-graphite-400">{rotulo}</p>
      <p className={`mt-1 text-xl font-bold ${alerta ? "text-safety-yellow-dark" : "text-navy-900"}`}>{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-graphite-400">{detalhe}</p>}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-graphite-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-graphite-800">{value}</dd>
    </div>
  );
}

/** Escolher um ou mais ativos para um plano que nasceu sem nenhum. O primeiro vira o
 * ativo deste plano; cada ativo a mais gera uma copia completa (mesma configuracao,
 * checklist e pecas) - e' "atribuir a varios ativos" sem inventar uma linha "plano da
 * familia" no banco: continuam sendo N planos de verdade, um por ativo. */
function AtribuirAtivosModal({
  plan,
  onClose,
  onAtribuido,
}: {
  plan: MaintenancePlan;
  onClose: () => void;
  onAtribuido: (totalDeAtivos: number) => void;
}) {
  const { notify } = useToast();
  const [ativos, setAtivos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (ativos.length === 0) {
      notify("error", "Adicione pelo menos um ativo.");
      return;
    }
    setSalvando(true);
    try {
      await atribuirAtivosAoPlano(plan.id, ativos);
      onAtribuido(ativos.length);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Atribuir ativos ao plano ${plan.code ?? plan.name}`}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={confirmar} disabled={salvando || ativos.length === 0}>
            {salvando ? "Atribuindo..." : "Confirmar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-graphite-500">
          Escolha um ativo, ou vários - cada ativo a mais cria uma cópia deste plano (mesma configuração, checklist e
          peças) só para ele.
        </p>

        {ativos.length > 0 && (
          <ul className="space-y-1">
            {ativos.map((instId) => (
              <AtivoEscolhidoChip key={instId} instrumentId={instId} onRemover={() => setAtivos((atual) => atual.filter((x) => x !== instId))} />
            ))}
          </ul>
        )}

        <InstrumentPicker
          key={ativos.length}
          name="ativoParaAtribuir"
          clientId={plan.clientId}
          onChange={(e) => {
            const idEscolhido = e.target.value;
            if (idEscolhido && !ativos.includes(idEscolhido)) setAtivos((atual) => [...atual, idEscolhido]);
          }}
        />
      </div>
    </Modal>
  );
}

function AtivoEscolhidoChip({ instrumentId, onRemover }: { instrumentId: string; onRemover: () => void }) {
  const { data: instrumento } = useQuery({
    queryKey: ["instrument-resumo-atribuir", instrumentId],
    queryFn: () => getInstrument(instrumentId),
  });
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
      <span className="min-w-0 truncate text-graphite-800">
        {instrumento ? `${instrumento.tag ?? instrumento.type} - ${instrumento.description || instrumento.model || ""}` : "Carregando..."}
      </span>
      <button type="button" className="shrink-0 text-graphite-400 hover:text-safety-red" onClick={onRemover} aria-label="Remover ativo">
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}
