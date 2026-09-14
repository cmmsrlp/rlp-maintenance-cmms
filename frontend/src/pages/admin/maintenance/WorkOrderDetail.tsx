import { useState } from "react";
import { CONDICOES_DE_EXECUCAO } from "../../../lib/maintenanceLabels";
import { centroDeCustoComDescricao } from "../../../lib/centroDeCusto";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, PlayCircle, CheckCircle2, Plus, X, Square, ShoppingCart, UserCheck, Printer, RefreshCw } from "lucide-react";
import { listRotableEquipment, substituteRotableEquipment } from "../../../api/rotableEquipment";
import { listFailureCodes } from "../../../api/failureCodes";
import type { RotableEquipment } from "../../../api/types";
import {
  getMaintenanceWorkOrder,
  updateMaintenanceWorkOrder,
  startMaintenanceWorkOrder,
  completeMaintenanceWorkOrder,
  updateChecklistItem,
  addWorkOrderPart,
  removeWorkOrderPart,
  addWorkOrderLabor,
  removeWorkOrderLabor,
  addWorkOrderThirdPartyService,
  removeWorkOrderThirdPartyService,
  addWorkOrderReservation,
  releaseWorkOrderReservation,
  consumeWorkOrderReservation,
  addWorkOrderStoppage,
  updateWorkOrderStoppage,
  removeWorkOrderStoppage,
  addWorkOrderAssignee,
  removeWorkOrderAssignee,
  assumirOrdem,
  definirResponsavel,
  liberarOrdem,
} from "../../../api/maintenanceWorkOrders";
import { listAssetParts } from "../../../api/instruments";
import { listStoppageReasons } from "../../../api/stoppageReasons";
import type { ChecklistItemResult, MaintenanceOrderStatus, LaborHourType, MaintenanceWorkOrder, FailureSeverity } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { SparePartPicker } from "../../../components/SparePartPicker";
import { LaborResourcePicker } from "../../../components/LaborResourcePicker";
import { Tabs } from "../../../components/Tabs";
import { WorkOrderAttachments } from "./WorkOrderAttachments";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput, TextareaInput, CheckboxInput } from "../../../components/form/Field";
import { useCmms } from "../../../lib/cmms";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { clientDisplayName, formatDateTime, formatCurrency } from "../../../lib/format";
import { getClient, getOwnClient } from "../../../api/clients";
import { imprimirOS } from "../../../lib/printWorkOrder";

const RESULT_OPTIONS: { value: ChecklistItemResult; label: string; tone: string }[] = [
  { value: "OK", label: "OK", tone: "bg-green-50 text-safety-green-dark border-green-200" },
  { value: "NOT_OK", label: "Nao OK", tone: "bg-red-50 text-safety-red border-red-200" },
  { value: "NA", label: "N/A", tone: "bg-graphite-100 text-graphite-600 border-graphite-200" },
];

import { rotuloDoTipo, GRAVIDADES_DE_FALHA } from "../../../lib/maintenanceLabels";
const PRIORITY_LABELS: Record<string, string> = { LOW: "Baixa", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Critica" };
const HOUR_TYPE_LABELS: Record<LaborHourType, string> = { NORMAL: "Normal", OVERTIME: "Extra", NIGHT: "Noturna" };

export default function WorkOrderDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const { canManage, isClient, base } = useCmms();

  const [tab, setTab] = useState("geral");
  const [busy, setBusy] = useState(false);
  const [consumeModal, setConsumeModal] = useState<{ reservationId: string; reservado: number; peca: string; valor: string } | null>(null);
  const [substituteOpen, setSubstituteOpen] = useState(false);
  const [closureNotes, setClosureNotes] = useState("");
  const [partSparePartId, setPartSparePartId] = useState("");
  const [partQty, setPartQty] = useState(1);
  const [laborResourceId, setLaborResourceId] = useState("");
  const [laborHours, setLaborHours] = useState(1);
  const [laborHourType, setLaborHourType] = useState<LaborHourType | "">("");
  const [laborStart, setLaborStart] = useState("");
  const [laborEnd, setLaborEnd] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceCost, setServiceCost] = useState(0);
  const [reservationSparePartId, setReservationSparePartId] = useState("");
  const [reservationQty, setReservationQty] = useState(1);
  const [stoppageReasonId, setStoppageReasonId] = useState("");
  const [stoppageStart, setStoppageStart] = useState("");
  const [stoppageNotes, setStoppageNotes] = useState("");

  const { data: workOrder, isLoading } = useQuery({ queryKey: ["maintenance-work-order", id], queryFn: () => getMaintenanceWorkOrder(id) });
  const { data: assetParts } = useQuery({
    queryKey: ["instrument-asset-parts", workOrder?.instrumentId],
    queryFn: () => listAssetParts(workOrder!.instrumentId),
    enabled: !!workOrder?.instrumentId,
  });
  const { data: stoppageReasons } = useQuery({
    queryKey: ["stoppage-reasons-picker"],
    queryFn: () => listStoppageReasons({ active: true }),
  });

  // Atalho no apontamento de horas: equipe desta OS (responsavel + apoio) primeiro. Vem
  // direto do proprio workOrder (que ja embute nome/funcao de cada um) em vez de uma lista
  // paginada da equipe inteira do cliente, que poderia nao conter estes nomes.
  const teamOptions = [
    ...(workOrder?.assignedResource ? [workOrder.assignedResource] : []),
    ...(workOrder?.assignees ?? []).map((a) => a.laborResource).filter((r): r is NonNullable<typeof r> => !!r),
  ];

  // Atalho com as pecas ja cadastradas no BOM do ativo desta OS - o proprio vinculo ja traz
  // a peca embutida, entao nao depende de nenhuma lista paginada do almoxarifado inteiro.
  const bomOptions = (assetParts ?? []).map((a) => a.sparePart).filter((p): p is NonNullable<typeof p> => !!p);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["maintenance-work-order", id] });
  }

  const [ocupadoResp, setOcupadoResp] = useState(false);
  const encerrada = workOrder?.status === "COMPLETED" || workOrder?.status === "CANCELED";

  async function assumir() {
    setOcupadoResp(true);
    try {
      await assumirOrdem(id);
      notify("success", "OS assumida.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setOcupadoResp(false);
    }
  }

  async function atribuir(resourceId: string | null) {
    setOcupadoResp(true);
    try {
      await definirResponsavel(id, resourceId);
      notify("success", resourceId ? "Responsavel definido." : "Responsavel removido.");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["maintenance-schedule"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setOcupadoResp(false);
    }
  }

  const liberada = ["RELEASED", "IN_PROGRESS"].includes(workOrder?.status ?? "");

  async function handleRelease() {
    setBusy(true);
    try {
      const atualizada = await liberarOrdem(id);
      notify(
        "success",
        atualizada.assignedResource
          ? `OS liberada - responsavel: ${atualizada.assignedResource.name}.`
          : "OS liberada. Defina o responsavel abaixo.",
      );
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    setBusy(true);
    try {
      await startMaintenanceWorkOrder(id);
      notify("success", "OS iniciada.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** Grava o relato da execucao sem sair da aba - e' texto longo, salvar ao sair do campo
   * evita perder o que foi digitado. */
  async function handleSalvarRelato(valores: { executionNotes?: string | null }) {
    try {
      await updateMaintenanceWorkOrder(id, valores);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  /** Grava um campo do registro de falha. Sao poucos campos e o tecnico preenche no meio
   * do atendimento - salvar ao sair do campo evita um botao "salvar" a mais. */
  async function handleSalvarFalha(valores: Parameters<typeof updateMaintenanceWorkOrder>[1]) {
    try {
      await updateMaintenanceWorkOrder(id, valores);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleComplete() {
    setBusy(true);
    try {
      await completeMaintenanceWorkOrder(id, undefined, closureNotes.trim() || undefined);
      notify("success", "OS concluida.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange(status: MaintenanceOrderStatus) {
    setBusy(true);
    try {
      await updateMaintenanceWorkOrder(id, { status });
      notify("success", "Status atualizado.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleChecklistResult(itemId: string, result: ChecklistItemResult) {
    try {
      const { spawnedWorkOrder } = await updateChecklistItem(id, itemId, { result });
      if (spawnedWorkOrder) {
        notify("success", `Anomalia registrada - OS corretiva ${spawnedWorkOrder.number} aberta automaticamente.`);
      }
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  /** Grava medicao ou texto do item. O backend decide sozinho se a medicao ficou fora da
   * faixa e, nesse caso, abre a corretiva - mesma regra do "Nao OK". */
  async function handleChecklistValue(
    itemId: string,
    valores: { numericValue?: number | null; textValue?: string | null; result?: ChecklistItemResult },
  ) {
    try {
      const { spawnedWorkOrder } = await updateChecklistItem(id, itemId, valores);
      if (spawnedWorkOrder) {
        notify("success", `Medicao fora da faixa - OS corretiva ${spawnedWorkOrder.number} aberta automaticamente.`);
      }
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  async function handleAddPart() {
    if (!partSparePartId || partQty < 1) return;
    setBusy(true);
    try {
      await addWorkOrderPart(id, { sparePartId: partSparePartId, quantity: partQty });
      notify("success", "Peca registrada.");
      setPartSparePartId("");
      setPartQty(1);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemovePart(movementId: string) {
    setBusy(true);
    try {
      await removeWorkOrderPart(id, movementId);
      notify("success", "Peca removida e estoque estornado.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddLabor() {
    if (!laborResourceId || laborHours <= 0) return;
    setBusy(true);
    try {
      await addWorkOrderLabor(id, {
        laborResourceId,
        hours: laborHours,
        hourType: laborHourType || null,
        startedAt: laborStart ? new Date(laborStart).toISOString() : null,
        endedAt: laborEnd ? new Date(laborEnd).toISOString() : null,
      });
      notify("success", "Mao de obra registrada.");
      setLaborResourceId("");
      setLaborHours(1);
      setLaborHourType("");
      setLaborStart("");
      setLaborEnd("");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveLabor(entryId: string) {
    setBusy(true);
    try {
      await removeWorkOrderLabor(id, entryId);
      notify("success", "Lancamento removido.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddThirdPartyService() {
    if (!supplierName.trim() || !serviceDescription.trim()) return;
    setBusy(true);
    try {
      await addWorkOrderThirdPartyService(id, { supplierName, description: serviceDescription, cost: serviceCost });
      notify("success", "Servico de terceiro registrado.");
      setSupplierName("");
      setServiceDescription("");
      setServiceCost(0);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveThirdPartyService(serviceId: string) {
    setBusy(true);
    try {
      await removeWorkOrderThirdPartyService(id, serviceId);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddReservation() {
    if (!reservationSparePartId || reservationQty < 1) return;
    setBusy(true);
    try {
      await addWorkOrderReservation(id, { sparePartId: reservationSparePartId, quantity: reservationQty });
      notify("success", "Peca reservada.");
      setReservationSparePartId("");
      setReservationQty(1);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["spare-parts-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleReleaseReservation(reservationId: string) {
    setBusy(true);
    try {
      await releaseWorkOrderReservation(id, reservationId);
      notify("success", "Reserva liberada.");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["spare-parts-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  /** Consumir a reserva pergunta QUANTO foi usado, num modal (window.prompt e' um dialogo
   * nativo e bloqueante - travava a aba inteira em alguns ambientes/navegadores, achado numa
   * auditoria funcional). Baixar a reserva inteira quando se usou menos tira do saldo pecas
   * que continuam na prateleira - e o proximo a precisar delas recebe "sem saldo" com a peca
   * na mao. O que sobra volta ao estoque no mesmo ato. */
  function handleConsumeReservation(reservationId: string, reservado: number, peca: string) {
    setConsumeModal({ reservationId, reservado, peca, valor: String(reservado) });
  }

  async function submitConsumeReservation() {
    if (!consumeModal) return;
    const usado = Number(consumeModal.valor);
    if (!Number.isFinite(usado) || usado <= 0 || usado > consumeModal.reservado) {
      notify("error", `Informe um numero entre 1 e ${consumeModal.reservado}.`);
      return;
    }

    setBusy(true);
    try {
      const r = await consumeWorkOrderReservation(id, consumeModal.reservationId, usado);
      notify(
        "success",
        r.devolvida > 0
          ? `Baixa de ${r.consumida} registrada - ${r.devolvida} devolvido ao estoque.`
          : "Reserva consumida - baixa registrada no estoque.",
      );
      setConsumeModal(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["spare-parts-picker"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStoppage() {
    if (!stoppageStart) return;
    setBusy(true);
    try {
      await addWorkOrderStoppage(id, {
        reasonId: stoppageReasonId || null,
        startedAt: new Date(stoppageStart).toISOString(),
        notes: stoppageNotes || null,
      });
      notify("success", "Parada registrada.");
      setStoppageReasonId("");
      setStoppageStart("");
      setStoppageNotes("");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleEndStoppage(stoppageId: string) {
    setBusy(true);
    try {
      await updateWorkOrderStoppage(id, stoppageId, { endedAt: new Date().toISOString() });
      notify("success", "Parada encerrada.");
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveStoppage(stoppageId: string) {
    setBusy(true);
    try {
      await removeWorkOrderStoppage(id, stoppageId);
      invalidate();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || !workOrder) return <FullPageSpinner />;

  const isCompleted = workOrder.status === "COMPLETED";

  const janelaPlanejada =
    workOrder.plannedStart || workOrder.plannedEnd
      ? `${workOrder.plannedStart ? formatDateTime(workOrder.plannedStart) : "?"} ate ${workOrder.plannedEnd ? formatDateTime(workOrder.plannedEnd) : "?"}`
      : "-";

  // Horas realizadas: a soma dos apontamentos e' a fonte de verdade quando existe; o campo
  // solto da OS so vale para as OS antigas, anteriores ao apontamento por pessoa.
  const horasApontadas = (workOrder.laborEntries ?? []).reduce((soma, e) => soma + e.hours, 0);
  const horasRealizadas = horasApontadas > 0 ? horasApontadas : workOrder.laborHours ?? null;

  const ehQuebra = workOrder.correctiveType === "BREAKDOWN";

  // O mesmo que o backend cobra na conclusao - mostrado antes, para nao virar surpresa na
  // hora de fechar a OS.
  const faltaParaConcluir = [
    !workOrder.failureStartedAt && "inicio da falha",
    !workOrder.failureEndedAt && "termino da falha",
    !workOrder.failureCodeId && "categoria da falha",
    !workOrder.failureSeverity && "gravidade",
    !workOrder.failureDescription?.trim() && "descricao da falha",
  ].filter(Boolean) as string[];

  // Tempo parado sai da janela informada - nunca e' digitado, para nao divergir das datas.
  const downtimeDaFalha =
    workOrder.failureStartedAt && workOrder.failureEndedAt
      ? (new Date(workOrder.failureEndedAt).getTime() - new Date(workOrder.failureStartedAt).getTime()) / 3600000
      : null;
  const hasTraceability = !!workOrder.serviceRequest || !!workOrder.originWorkOrder || (workOrder.spawnedWorkOrders?.length ?? 0) > 0;

  // Custo desta OS - mesmo criterio do resumo por ativo (so soma o que tem custo
  // informado; "Nao rastreado" quando nada foi preenchido, nunca aparenta zero).
  const partsWithCost = (workOrder.partsUsed ?? []).filter((p) => p.unitCost != null);
  const partsCost = partsWithCost.reduce((sum, p) => sum + p.unitCost! * p.quantity, 0);
  const partsCostKnown = partsWithCost.length > 0;
  const laborWithCost = (workOrder.laborEntries ?? []).filter((l) => l.hourlyRateSnapshot != null);
  const laborCost = laborWithCost.reduce((sum, l) => sum + l.hourlyRateSnapshot! * l.hours, 0);
  const laborCostKnown = laborWithCost.length > 0;
  const thirdPartyCost = (workOrder.thirdPartyServices ?? []).reduce((sum, s) => sum + s.cost, 0);
  const thirdPartyCostKnown = (workOrder.thirdPartyServices ?? []).length > 0;
  const costSummaryKnown = partsCostKnown || laborCostKnown || thirdPartyCostKnown;

  async function handlePrint(currentWorkOrder: MaintenanceWorkOrder) {
    try {
      // Portal (CLIENT*) so alcanca /clients/me; a equipe interna usa /clients/:id -
      // mesma logo, dois jeitos de pedir, conforme quem esta olhando a tela.
      const client = isClient ? await getOwnClient() : await getClient(currentWorkOrder.clientId);
      imprimirOS(currentWorkOrder, client.logoUrl ?? null);
    } catch {
      // Sem logo nao impede a impressao - a OS sai sem marca, em vez de travar o botao.
      imprimirOS(currentWorkOrder, null);
    }
  }

  return (
    <div>
      <PageHeader
        title={workOrder.title ? `${workOrder.number} - ${workOrder.title}` : workOrder.number}
        description={isClient ? `Ativo: ${workOrder.instrument?.tag ?? "-"}` : `${clientDisplayName(workOrder.client)} - Ativo: ${workOrder.instrument?.tag ?? "-"}`}
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Ordens", to: `${base}/ordens` },
          { label: workOrder.number },
        ]}
        actions={
          <>
            <button className="btn-outline" onClick={() => void handlePrint(workOrder)}>
              <Printer className="h-4 w-4" /> Imprimir / PDF
            </button>
            {canManage && (
              <>
              {/* Liberar e iniciar sao coisas diferentes: liberar e' dizer "pode fazer"
                  (maquina disponivel, material chegou, parada autorizada); iniciar e' a
                  ferramenta na mao, e e' dele que sai o MTTR. Quem libera assume a OS, se
                  ela ainda nao tiver dono - e o planejador troca depois se precisar. */}
              {!workOrder.startedAt && !liberada && (
                <button className="btn-primary" onClick={() => void handleRelease()} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Liberar
                </button>
              )}
              {!workOrder.startedAt && liberada && (
                <button className="btn-primary" onClick={handleStart} disabled={busy}>
                  <PlayCircle className="h-4 w-4" /> Iniciar
                </button>
              )}
              {workOrder.startedAt && !isCompleted && (
                <button className="btn-primary" onClick={handleComplete} disabled={busy}>
                  <CheckCircle2 className="h-4 w-4" /> Concluir
                </button>
              )}
              {!isCompleted && (
                <button className="btn-outline" onClick={() => navigate(`${base}/ordens/${id}/editar`)}>
                  <Pencil className="h-4 w-4" /> Editar
                </button>
              )}
              {!isCompleted && (
                <button className="btn-outline" onClick={() => setSubstituteOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Substituir equipamento
                </button>
              )}
              {/* Nao existe "Remover": apagar a OS levaria junto as horas lancadas, o
                  material consumido e a falha registrada. O que se faz com uma OS que nao
                  sera executada e' CANCELAR, no seletor de situacao - o registro fica. */}
              </>
            )}
          </>
        }
      />

      <Tabs
        tabs={[
          { id: "geral", label: "Visao geral" },
          { id: "execucao", label: "Execucao" },
          { id: "equipe", label: "Equipe e horas" },
          { id: "materiais", label: "Materiais" },
          { id: "custos", label: "Custos" },
          { id: "anexos", label: "Anexos" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "geral" && (
        <div className="space-y-6">
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            {canManage && !isCompleted && !workOrder.startedAt ? (
              // So cobre os estados sem botao dedicado - "Em execucao" (Iniciar) e
              // "Concluida" (Concluir) tem acao propria, com validacao de checklist e
              // efeitos colaterais (ex.: fecha a Solicitacao de Servico vinculada) que
              // esse select generico nao replica.
              <select
                className="input h-auto w-auto py-1 text-xs"
                value={workOrder.status}
                disabled={busy}
                onChange={(e) => handleStatusChange(e.target.value as MaintenanceOrderStatus)}
              >
                <option value="OPEN">Aberta</option>
                <option value="IN_TRIAGE">Em triagem</option>
                <option value="PLANNED">Planejada</option>
                <option value="PROGRAMMED">Programada</option>
                <option value="RELEASED">Liberada</option>
                <option value="AWAITING_MATERIAL">Aguardando material</option>
                <option value="AWAITING_RELEASE">Aguardando liberacao</option>
                <option value="AWAITING_STOPPAGE">Aguardando parada</option>
                <option value="CANCELED">Cancelada</option>
              </select>
            ) : (
              <StatusBadge status={workOrder.status} />
            )}
            <span className="rounded-full border border-navy-200 bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-navy-700">
              {rotuloDoTipo(workOrder.type, workOrder.correctiveType)}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-graphite-700">
              Prioridade: {PRIORITY_LABELS[workOrder.priority]}
            </span>
          </div>
          <p className="text-sm text-graphite-700">{workOrder.description}</p>

          {/* Compra pendente e' o que segura a OS: fica no topo, e nao perdido num campo
              la embaixo que ninguem le antes de ir para o campo. */}
          {workOrder.needsPurchase && (
            <div className="rounded-lg border border-safety-yellow/40 bg-safety-yellow/10 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-graphite-800">
                <ShoppingCart className="h-4 w-4 text-safety-yellow-dark" /> Precisa comprar material antes de executar
              </p>
              {workOrder.purchaseNotes && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-graphite-700">{workOrder.purchaseNotes}</p>
              )}
            </div>
          )}
          <dl className="grid gap-4 sm:grid-cols-2">
            {!isClient && <Info label="Tecnico" value={workOrder.technician?.name ?? "-"} />}
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">Quem vai executar</p>
              <p className="mt-0.5 font-medium text-navy-900">
                {workOrder.assignedResource
                  ? `${workOrder.assignedResource.name} (${workOrder.assignedResource.type})`
                  : "A definir"}
              </p>

              {/* Dois caminhos ate a OS ter dono, porque a manutencao usa os dois: quem
                  planeja distribui a carga da semana, e o mantenedor pega da fila quando
                  esta livre. Assumir NAO inicia a OS - iniciar e' o botao proprio, e
                  misturar os dois estragaria o MTTR. */}
              {!encerrada && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!workOrder.assignedResource && (
                    <button className="btn-outline text-sm" onClick={() => void assumir()} disabled={ocupadoResp}>
                      <UserCheck className="h-4 w-4" /> Assumir esta OS
                    </button>
                  )}
                  {canManage && (
                    <LaborResourcePicker
                      label=""
                      className="sm:w-64"
                      placeholder="Sem responsavel"
                      disabled={ocupadoResp}
                      clientId={workOrder.clientId}
                      name="assignedResourceId"
                      value={workOrder.assignedResourceId ?? ""}
                      onChange={(e) => void atribuir(e.target.value || null)}
                    />
                  )}
                </div>
              )}
            </div>
            <Info label="Programada para" value={workOrder.scheduledDate ? formatDateTime(workOrder.scheduledDate).slice(0, 10) : "-"} />
            <Info label="Codigo de falha" value={workOrder.failureCode ? `${workOrder.failureCode.code} - ${workOrder.failureCode.description}` : "-"} />
            {/* Vinculo duplo: instrumentId acima (no cabecalho da OS) e' o local funcional;
                isto e' a unidade fisica que apresentou a falha, quando houver uma vinculada. */}
            <Info label="Equipamento instalado" value={workOrder.rotableEquipment ? `${workOrder.rotableEquipment.code} (${workOrder.rotableEquipment.type})` : "-"} />
            <Info label="Centro de custo" value={centroDeCustoComDescricao(workOrder.costCenter)} />
            <Info label="Janela planejada" value={janelaPlanejada} />
            {/* Decisao do planejador na conversao da solicitacao: quem executa precisa
                saber se pode fazer com a maquina rodando ou se espera a parada. */}
            {workOrder.executionCondition && (
              <Info label="Condicao de execucao" value={CONDICOES_DE_EXECUCAO[workOrder.executionCondition]} />
            )}
            <Info label="Iniciada em" value={formatDateTime(workOrder.startedAt)} />
            <Info label="Concluida em" value={formatDateTime(workOrder.completedAt)} />
            {/* Estimado e realizado lado a lado: e' a comparacao que diz se o plano esta
                dimensionado certo. */}
            <Info label="Horas estimadas" value={workOrder.estimatedHours != null ? `${workOrder.estimatedHours}h` : "-"} />
            <Info label="Horas trabalhadas" value={horasRealizadas != null ? `${horasRealizadas}h` : "-"} />
            <Info label="Plano de origem" value={workOrder.plan?.name ?? "Avulsa"} />
            {workOrder.closedBy && <Info label="Encerrada por" value={`${workOrder.closedBy.name}${workOrder.closedAt ? ` em ${formatDateTime(workOrder.closedAt)}` : ""}`} />}
          </dl>
          {workOrder.observations && (
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">Observacoes</p>
              <p className="mt-1 text-sm text-graphite-700">{workOrder.observations}</p>
            </div>
          )}
          {workOrder.closureNotes && (
            <div>
              <p className="text-xs uppercase tracking-wide text-graphite-400">Observacoes de encerramento</p>
              <p className="mt-1 text-sm text-graphite-700">{workOrder.closureNotes}</p>
            </div>
          )}
        </div>

        {hasTraceability && (
          <div className="card space-y-3 p-5">
            <h2 className="font-semibold text-navy-900">Rastreabilidade</h2>
            {workOrder.serviceRequest && (
              <Link to={`${base}/solicitacoes/${workOrder.serviceRequest.id}`} className="flex items-center justify-between text-sm text-navy-700 hover:underline">
                <span>Originada da solicitacao de servico <span className="font-medium">{workOrder.serviceRequest.number}</span></span>
                <StatusBadge status={workOrder.serviceRequest.status} />
              </Link>
            )}
            {workOrder.originWorkOrder && (
              <Link to={`${base}/ordens/${workOrder.originWorkOrder.id}`} className="block text-sm text-navy-700 hover:underline">
                Anomalia identificada na inspecao da OS <span className="font-medium">{workOrder.originWorkOrder.number}</span>
                {workOrder.originChecklistItem && <span className="text-graphite-500"> - item: "{workOrder.originChecklistItem.description}"</span>}
              </Link>
            )}
            {(workOrder.spawnedWorkOrders?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-xs uppercase tracking-wide text-graphite-400">Corretivas abertas por anomalia nesta OS</p>
                <ul className="divide-y divide-gray-100">
                  {workOrder.spawnedWorkOrders!.map((w) => (
                    <li key={w.id}>
                      <Link to={`${base}/ordens/${w.id}`} className="flex items-center justify-between py-1.5 text-sm text-navy-700 hover:underline">
                        <span className="font-medium">{w.number}</span>
                        <StatusBadge status={w.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {tab === "execucao" && (
        <div className="space-y-6">
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Checklist de execucao</h2>
          {!workOrder.checklist || workOrder.checklist.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhum item de checklist.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.checklist.map((item, index) => {
                const secaoAnterior = index > 0 ? workOrder.checklist![index - 1].section : null;
                const abreSecao = item.section && item.section !== secaoAnterior;
                return (
                  <li key={item.id} className="py-2.5">
                    {abreSecao && (
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-graphite-400">{item.section}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-sm text-graphite-800">
                          {item.description}
                          {item.required && <span className="ml-1 text-safety-red">*</span>}
                        </span>
                        {item.reference && (
                          <p className="text-xs text-graphite-400">Ref.: {item.reference}</p>
                        )}
                        {item.responseType === "NUMBER" && (item.minValue != null || item.maxValue != null) && (
                          <p className="text-xs text-graphite-400">
                            Faixa aceitavel: {item.minValue ?? "-"} a {item.maxValue ?? "-"}
                            {item.unit ? ` ${item.unit}` : ""}
                            {item.targetValue != null ? ` (alvo ${item.targetValue})` : ""}
                          </p>
                        )}
                        {item.requiresPhoto && (
                          <p className="text-xs text-safety-yellow-dark">Exige foto - anexe na aba Anexos.</p>
                        )}
                      </div>

                      {/* Medicao numerica: o valor e' a resposta. Fora da faixa vira anomalia
                          sozinho, sem depender de alguem lembrar de marcar "Nao OK". */}
                      {item.responseType === "NUMBER" ? (
                        <div className="flex shrink-0 items-center gap-2">
                          <input
                            type="number"
                            step="any"
                            defaultValue={item.numericValue ?? ""}
                            disabled={!canManage || isCompleted}
                            placeholder={item.unit ?? "valor"}
                            className="input h-9 w-32 py-1 text-sm"
                            onBlur={(e) => {
                              const valor = e.target.value === "" ? null : Number(e.target.value);
                              if (valor !== (item.numericValue ?? null)) handleChecklistValue(item.id, { numericValue: valor });
                            }}
                          />
                          {item.result !== "PENDING" && (
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                              item.result === "NOT_OK"
                                ? "border-red-200 bg-red-50 text-safety-red"
                                : "border-green-200 bg-green-50 text-safety-green-dark"
                            }`}>
                              {item.result === "NOT_OK" ? "Fora da faixa" : "Na faixa"}
                            </span>
                          )}
                        </div>
                      ) : item.responseType === "TEXT" ? (
                        <input
                          type="text"
                          defaultValue={item.textValue ?? ""}
                          disabled={!canManage || isCompleted}
                          placeholder="Resposta"
                          className="input h-9 w-56 py-1 text-sm"
                          onBlur={(e) => {
                            if (e.target.value !== (item.textValue ?? "")) {
                              handleChecklistValue(item.id, { textValue: e.target.value || null, result: "OK" });
                            }
                          }}
                        />
                      ) : (
                        <div className="flex shrink-0 gap-1.5">
                          {RESULT_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={!canManage || isCompleted}
                              onClick={() => handleChecklistResult(item.id, opt.value)}
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-opacity disabled:opacity-40 ${
                                item.result === opt.value ? opt.tone : "border-gray-200 bg-white text-graphite-400"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {/* Registro de falha: so na corretiva. E' o que o tecnico que atendeu a quebra sabe
            e ninguem mais vai lembrar depois - por isso fica junto do atendimento, e nao
            numa tela separada que alguem teria que abrir depois. */}
        {workOrder.type === "CORRECTIVE" && (
          <div className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-navy-900">Registro da falha</h2>
                <p className="text-xs text-graphite-500">
                  Alimenta o Pareto de falhas e a tela de Falhas/RCA. O tempo parado sai das datas abaixo.
                </p>
              </div>
              {ehQuebra && faltaParaConcluir.length > 0 && (
                <span className="w-full rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-safety-red">
                  Corretiva de quebra: falta {faltaParaConcluir.join(", ")} para conseguir concluir esta OS.
                </span>
              )}
              {downtimeDaFalha != null && (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-safety-red">
                  Parada de {downtimeDaFalha.toFixed(1)}h
                </span>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-graphite-700">Inicio da falha</span>
                <input
                  type="datetime-local"
                  className="input"
                  defaultValue={workOrder.failureStartedAt?.slice(0, 16) ?? ""}
                  disabled={!canManage || isCompleted}
                  onBlur={(e) => handleSalvarFalha({ failureStartedAt: e.target.value || null })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-graphite-700">Termino da falha</span>
                <input
                  type="datetime-local"
                  className="input"
                  defaultValue={workOrder.failureEndedAt?.slice(0, 16) ?? ""}
                  disabled={!canManage || isCompleted}
                  onBlur={(e) => handleSalvarFalha({ failureEndedAt: e.target.value || null })}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-graphite-700">Gravidade</span>
                <select
                  className="input"
                  defaultValue={workOrder.failureSeverity ?? ""}
                  disabled={!canManage || isCompleted}
                  onChange={(e) => handleSalvarFalha({ failureSeverity: (e.target.value || null) as FailureSeverity | null })}
                >
                  <option value="">Nao informada</option>
                  {GRAVIDADES_DE_FALHA.map((g) => (
                    <option key={g.valor} value={g.valor}>{g.rotulo}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-graphite-700">Perda de producao</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  placeholder="Estimativa"
                  defaultValue={workOrder.productionLoss ?? ""}
                  disabled={!canManage || isCompleted}
                  onBlur={(e) => handleSalvarFalha({ productionLoss: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-graphite-700">
                Descricao da falha / sintoma{ehQuebra && <span className="ml-1 text-safety-red">*</span>}
              </span>
              <textarea
                className="input min-h-[70px]"
                placeholder="O que aconteceu, na descricao de quem foi ver."
                defaultValue={workOrder.failureDescription ?? ""}
                disabled={!canManage || isCompleted}
                onBlur={(e) => {
                  if (e.target.value !== (workOrder.failureDescription ?? "")) handleSalvarFalha({ failureDescription: e.target.value || null });
                }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-graphite-700">Acao corretiva tomada</span>
              <textarea
                className="input min-h-[70px]"
                placeholder="O que foi feito para corrigir a falha."
                defaultValue={workOrder.failureCorrectiveAction ?? ""}
                disabled={!canManage || isCompleted}
                onBlur={(e) => {
                  if (e.target.value !== (workOrder.failureCorrectiveAction ?? "")) handleSalvarFalha({ failureCorrectiveAction: e.target.value || null });
                }}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-graphite-700">Causa identificada no atendimento</span>
              <textarea
                className="input min-h-[70px]"
                placeholder="O que causou a quebra, no que deu pra apurar na hora."
                defaultValue={workOrder.failureRootCause ?? ""}
                disabled={!canManage || isCompleted}
                onBlur={(e) => {
                  if (e.target.value !== (workOrder.failureRootCause ?? "")) handleSalvarFalha({ failureRootCause: e.target.value || null });
                }}
              />
            </label>

            {/* A causa acima e' o que deu pra ver na hora. Quando a falha se repete ou o
                impacto e' grande, a investigacao de verdade e' a RCA. */}
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              {workOrder.rootCauseAnalyses && workOrder.rootCauseAnalyses.length > 0 ? (
                <p className="text-sm text-graphite-600">
                  RCA aberta para esta falha.{" "}
                  <Link to={`${base}/manutencao/rca/${workOrder.rootCauseAnalyses[0].id}`} className="font-medium text-navy-700 hover:underline">
                    Ver analise
                  </Link>
                </p>
              ) : (
                <>
                  <p className="text-sm text-graphite-600">Falha recorrente ou de grande impacto? Abra uma analise de causa raiz.</p>
                  <Link to={`${base}/manutencao/rca/novo?workOrderId=${workOrder.id}`} className="btn-outline ml-auto text-sm">
                    Abrir RCA
                  </Link>
                </>
              )}
            </div>
          </div>
        )}

        {/* O relato do servico. Separado das "Observacoes" da abertura: aquilo e' o que se
            pediu, isto e' o que se fez - misturar os dois apaga o historico. */}
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Atividade executada</h2>
          <textarea
            className="input min-h-[90px]"
            placeholder="O que foi feito, o que foi trocado, o que ficou pendente."
            defaultValue={workOrder.executionNotes ?? ""}
            disabled={!canManage || isCompleted}
            onBlur={(e) => {
              if (e.target.value !== (workOrder.executionNotes ?? "")) handleSalvarRelato({ executionNotes: e.target.value || null });
            }}
          />
          {!isCompleted && canManage && (
            <>
              <h3 className="pt-1 text-sm font-medium text-graphite-700">Observacoes de encerramento</h3>
              <textarea
                className="input min-h-[70px]"
                placeholder="Combinados, pendencias e o que acompanhar depois - gravado ao concluir a OS."
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
              />
            </>
          )}
        </div>

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Paradas</h2>
          {canManage && !isCompleted && (
            <div className="space-y-2">
              <select className="input" value={stoppageReasonId} onChange={(e) => setStoppageReasonId(e.target.value)}>
                <option value="">Motivo (opcional)</option>
                {(stoppageReasons ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              <input type="datetime-local" className="input" value={stoppageStart} onChange={(e) => setStoppageStart(e.target.value)} />
              <div className="flex items-center gap-2">
                <input className="input flex-1" placeholder="Observacao (opcional)" value={stoppageNotes} onChange={(e) => setStoppageNotes(e.target.value)} />
                <button type="button" className="btn-outline shrink-0" onClick={handleAddStoppage} disabled={busy || !stoppageStart}>
                  <Plus className="h-4 w-4" /> Registrar
                </button>
              </div>
            </div>
          )}
          {!workOrder.stoppages || workOrder.stoppages.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhuma parada registrada.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.stoppages.map((s) => (
                <li key={s.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-graphite-800">{s.reason?.name ?? "Sem motivo"}</span>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        {!s.endedAt && (
                          <button onClick={() => handleEndStoppage(s.id)} className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:underline">
                            <Square className="h-3 w-3" /> Encerrar
                          </button>
                        )}
                        <button onClick={() => handleRemoveStoppage(s.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover parada">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-graphite-400">
                    {formatDateTime(s.startedAt)} ate {s.endedAt ? formatDateTime(s.endedAt) : "em aberto"}
                  </p>
                  {s.notes && <p className="text-xs text-graphite-500">{s.notes}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      )}

      {tab === "equipe" && (
        <div className="space-y-6">
          <WorkOrderTeam workOrder={workOrder} canManage={!!canManage} onChanged={invalidate} />
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Mao de obra</h2>
          {canManage && !isCompleted && (
            <div className="space-y-2">
              {teamOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-graphite-400">Equipe desta OS:</span>
                  {teamOptions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-graphite-700 hover:border-navy-400 hover:text-navy-700"
                      onClick={() => setLaborResourceId(r.id)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <LaborResourcePicker
                  className="flex-1"
                  placeholder="Buscar quem trabalhou"
                  name="laborResourceId"
                  value={laborResourceId}
                  onChange={(e) => setLaborResourceId(e.target.value)}
                  clientId={workOrder.clientId}
                />
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  className="input w-24"
                  value={laborHours}
                  onChange={(e) => setLaborHours(Number(e.target.value))}
                  aria-label="Horas"
                />
                <select className="input w-36" value={laborHourType} onChange={(e) => setLaborHourType(e.target.value as LaborHourType | "")}>
                  <option value="">Tipo de hora</option>
                  <option value="NORMAL">Normal</option>
                  <option value="OVERTIME">Extra</option>
                  <option value="NIGHT">Noturna</option>
                </select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 text-xs text-graphite-500">
                  Inicio (opcional)
                  <input type="datetime-local" className="input" value={laborStart} onChange={(e) => setLaborStart(e.target.value)} />
                </label>
                <label className="flex-1 text-xs text-graphite-500">
                  Fim (opcional)
                  <input type="datetime-local" className="input" value={laborEnd} onChange={(e) => setLaborEnd(e.target.value)} />
                </label>
                <button type="button" className="btn-outline" onClick={handleAddLabor} disabled={busy || !laborResourceId}>
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </div>
            </div>
          )}
          {!workOrder.laborEntries || workOrder.laborEntries.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhum lancamento de mao de obra.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.laborEntries.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span>
                      {entry.laborResource?.name ?? "Mao de obra"} - {entry.hours}h{entry.hourType ? ` (${HOUR_TYPE_LABELS[entry.hourType]})` : ""}
                      {entry.hourlyRateSnapshot != null && ` - ${formatCurrency(entry.hourlyRateSnapshot * entry.hours)}`}
                    </span>
                    {(entry.startedAt || entry.endedAt) && (
                      <p className="text-xs text-graphite-400">
                        {entry.startedAt ? formatDateTime(entry.startedAt) : "-"} ate {entry.endedAt ? formatDateTime(entry.endedAt) : "-"}
                      </p>
                    )}
                  </div>
                  {canManage && !isCompleted && (
                    <button onClick={() => handleRemoveLabor(entry.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover lancamento">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      )}

      {tab === "materiais" && (
        <div className="space-y-6">
        {/* Previsto x reservado x consumido x falta, numa tabela so. Antes cada numero
            vivia num canto (previsto no plano, reservado nas reservas, consumido nos
            movimentos) e quem precisava saber "da para executar amanha?" somava de cabeca. */}
        {workOrder.materialSummary && workOrder.materialSummary.itens.length > 0 && (
          <div className="card p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy-900">Material previsto</h2>
              {workOrder.materialSummary.faltaObrigatorio ? (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-safety-red">
                  Falta material obrigatorio - a OS nao tem como ser executada
                </span>
              ) : workOrder.materialSummary.itensEmFalta > 0 ? (
                <span className="rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-medium text-safety-yellow-dark">
                  {workOrder.materialSummary.itensEmFalta} item(ns) opcional(is) em falta
                </span>
              ) : (
                <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-safety-green-dark">
                  Material coberto
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-graphite-500">
                  <tr>
                    <th className="px-3 py-2">Peca</th>
                    <th className="px-3 py-2 text-right">Necessario</th>
                    <th className="px-3 py-2 text-right">Reservado</th>
                    <th className="px-3 py-2 text-right">Consumido</th>
                    <th className="px-3 py-2 text-right">Saldo livre</th>
                    <th className="px-3 py-2 text-right">Falta</th>
                    <th className="px-3 py-2 text-right">Custo previsto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workOrder.materialSummary.itens.map((m) => (
                    <tr key={m.sparePartId} className={m.falta > 0 && m.obrigatorio ? "bg-red-50/40" : undefined}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-navy-900">{m.nome}</p>
                        <p className="text-xs text-graphite-400">
                          {m.obrigatorio ? "Obrigatorio" : "Opcional"}
                          {m.abaixoDoMinimo && <span className="ml-1 text-safety-red">- abaixo do estoque minimo</span>}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-navy-900">{m.previsto} {m.unidade}</td>
                      <td className="px-3 py-2 text-right text-graphite-700">{m.reservado}</td>
                      <td className="px-3 py-2 text-right text-graphite-700">{m.consumido}</td>
                      <td className="px-3 py-2 text-right text-graphite-700">{m.saldoDisponivel}</td>
                      <td className="px-3 py-2 text-right">
                        {m.falta > 0 ? (
                          <span className={m.obrigatorio ? "font-semibold text-safety-red" : "font-medium text-safety-yellow-dark"}>{m.falta}</span>
                        ) : (
                          <span className="text-graphite-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-graphite-700">
                        {m.custoPrevisto != null ? formatCurrency(m.custoPrevisto) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm text-graphite-600">
              Custo previsto:{" "}
              <span className="font-semibold text-navy-900">
                {workOrder.materialSummary.custoPrevisto != null ? formatCurrency(workOrder.materialSummary.custoPrevisto) : "sem base"}
              </span>
              {" x realizado: "}
              <span className="font-semibold text-navy-900">{formatCurrency(workOrder.materialSummary.custoRealizado)}</span>
              {workOrder.materialSummary.custoPrevisto == null && (
                <span className="text-xs text-graphite-500"> (alguma peca esta sem custo unitario cadastrado)</span>
              )}
            </p>
          </div>
        )}

        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Pecas consumidas (almoxarifado)</h2>
          {canManage && !isCompleted && (
            <div className="space-y-2">
              {bomOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-graphite-400">Pecas deste ativo:</span>
                  {bomOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="rounded-full border border-gray-200 px-2 py-0.5 text-xs text-graphite-700 hover:border-navy-400 hover:text-navy-700"
                      onClick={() => setPartSparePartId(p.id)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <SparePartPicker
                  className="flex-1"
                  name="partSparePartId"
                  value={partSparePartId}
                  onChange={(e) => setPartSparePartId(e.target.value)}
                  clientId={workOrder.clientId}
                />
                <input
                  type="number"
                  min={1}
                  className="input w-24"
                  value={partQty}
                  onChange={(e) => setPartQty(Number(e.target.value))}
                />
                <button type="button" className="btn-outline" onClick={handleAddPart} disabled={busy || !partSparePartId}>
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </div>
            </div>
          )}
          {!workOrder.partsUsed || workOrder.partsUsed.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhuma peca registrada.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.partsUsed.map((part) => (
                <li key={part.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{part.sparePart?.name ?? "Peca"} - {part.quantity} {part.sparePart?.unit ?? "un."}</span>
                  {canManage && !isCompleted && (
                    <button onClick={() => handleRemovePart(part.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover peca">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Materiais reservados</h2>
          {canManage && !isCompleted && (
            <div className="flex flex-wrap items-end gap-2">
              <SparePartPicker
                className="flex-1"
                name="reservationSparePartId"
                value={reservationSparePartId}
                onChange={(e) => setReservationSparePartId(e.target.value)}
                clientId={workOrder.clientId}
              />
              <input
                type="number"
                min={1}
                className="input w-20"
                value={reservationQty}
                onChange={(e) => setReservationQty(Number(e.target.value))}
              />
              <button type="button" className="btn-outline" onClick={handleAddReservation} disabled={busy || !reservationSparePartId}>
                <Plus className="h-4 w-4" /> Reservar
              </button>
            </div>
          )}
          {!workOrder.partReservations || workOrder.partReservations.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhuma peca reservada.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.partReservations.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.sparePart?.name ?? "Peca"} - {r.quantity} {r.sparePart?.unit ?? "un."}</span>
                  {canManage && !isCompleted && (
                    <div className="flex gap-2">
                      <button onClick={() => handleConsumeReservation(r.id, r.quantity, r.sparePart?.name ?? "peca")} className="text-xs font-medium text-navy-700 hover:underline">Consumir</button>
                      <button onClick={() => handleReleaseReservation(r.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Liberar reserva">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      )}

      {tab === "custos" && (
        <div className="space-y-6">
        {costSummaryKnown && (
          <div className="card space-y-2 p-5">
            <h2 className="font-semibold text-navy-900">Custo desta OS</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-graphite-500">Pecas</dt><dd className="font-medium text-graphite-800">{partsCostKnown ? formatCurrency(partsCost) : "Nao rastreado"}</dd></div>
              <div className="flex justify-between"><dt className="text-graphite-500">Mao de obra</dt><dd className="font-medium text-graphite-800">{laborCostKnown ? formatCurrency(laborCost) : "Nao rastreado"}</dd></div>
              <div className="flex justify-between"><dt className="text-graphite-500">Terceiros</dt><dd className="font-medium text-graphite-800">{thirdPartyCostKnown ? formatCurrency(thirdPartyCost) : "Nao rastreado"}</dd></div>
              <div className="flex justify-between border-t border-gray-100 pt-1.5"><dt className="font-semibold text-navy-900">Total</dt><dd className="font-semibold text-navy-900">{formatCurrency(partsCost + laborCost + thirdPartyCost)}</dd></div>
            </dl>
          </div>
        )}
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold text-navy-900">Servicos de terceiros</h2>
          {canManage && !isCompleted && (
            <div className="space-y-2">
              <input className="input" placeholder="Fornecedor" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              <input className="input" placeholder="Descricao do servico" value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className="input flex-1"
                  placeholder="Custo"
                  value={serviceCost || ""}
                  onChange={(e) => setServiceCost(Number(e.target.value))}
                />
                <button type="button" className="btn-outline" onClick={handleAddThirdPartyService} disabled={busy || !supplierName || !serviceDescription}>
                  <Plus className="h-4 w-4" /> Adicionar
                </button>
              </div>
            </div>
          )}
          {!workOrder.thirdPartyServices || workOrder.thirdPartyServices.length === 0 ? (
            <p className="text-sm text-graphite-500">Nenhum servico de terceiro.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {workOrder.thirdPartyServices.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="text-graphite-800">{s.supplierName} - {formatCurrency(s.cost)}</p>
                    <p className="text-xs text-graphite-400">{s.description}</p>
                  </div>
                  {canManage && !isCompleted && (
                    <button onClick={() => handleRemoveThirdPartyService(s.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover servico">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      )}

      {tab === "anexos" && <WorkOrderAttachments workOrderId={id} canEdit={!!canManage} />}

      <Modal
        open={!!consumeModal}
        onClose={() => setConsumeModal(null)}
        title="Consumir reserva"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-outline" onClick={() => setConsumeModal(null)}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={() => void submitConsumeReservation()} disabled={busy}>
              {busy ? "Registrando..." : "Confirmar baixa"}
            </button>
          </>
        }
      >
        {consumeModal && (
          <div className="space-y-3">
            <p className="text-sm text-graphite-600">
              Quanto de <span className="font-medium text-navy-900">"{consumeModal.peca}"</span> foi realmente utilizado? O que sobrar da
              reserva (de {consumeModal.reservado}) volta para o estoque automaticamente.
            </p>
            <TextInput
              label="Quantidade utilizada"
              type="number"
              min={1}
              max={consumeModal.reservado}
              value={consumeModal.valor}
              onChange={(e) => setConsumeModal({ ...consumeModal, valor: e.target.value })}
              autoFocus
            />
          </div>
        )}
      </Modal>

      {substituteOpen && (
        <SubstituteRotableModal
          workOrder={workOrder}
          onClose={() => setSubstituteOpen(false)}
          onDone={() => {
            setSubstituteOpen(false);
            queryClient.invalidateQueries({ queryKey: ["maintenance-work-order", id] });
          }}
        />
      )}
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


/**
 * Responsavel + equipe de apoio da OS. O responsavel e' quem responde pelo servico (e o
 * mesmo que aparece no quadro de programacao); a equipe de apoio e' quem mais entra no
 * trabalho. Nenhum dos dois trava o apontamento de horas - quem apareceu para ajudar no
 * dia consegue lancar as horas dele do mesmo jeito.
 */
function WorkOrderTeam({
  workOrder,
  canManage,
  onChanged,
}: {
  workOrder: MaintenanceWorkOrder;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { notify } = useToast();
  const [resourceId, setResourceId] = useState("");
  const [busy, setBusy] = useState(false);

  const jaNaEquipe = [
    ...(workOrder.assignees ?? []).map((a) => a.laborResourceId),
    ...(workOrder.assignedResourceId ? [workOrder.assignedResourceId] : []),
  ];
  const isCompleted = workOrder.status === "COMPLETED";

  async function handleAdd() {
    if (!resourceId) return;
    setBusy(true);
    try {
      await addWorkOrderAssignee(workOrder.id, resourceId);
      notify("success", "Adicionado a equipe da OS.");
      setResourceId("");
      onChanged();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(assigneeId: string) {
    setBusy(true);
    try {
      await removeWorkOrderAssignee(workOrder.id, assigneeId);
      onChanged();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4 p-5">
      <h2 className="font-semibold text-navy-900">Equipe da OS</h2>

      <div>
        <p className="text-xs uppercase tracking-wide text-graphite-400">Responsavel</p>
        {workOrder.assignedResource ? (
          <p className="mt-1 text-sm font-medium text-graphite-800">
            {workOrder.assignedResource.name} <span className="font-normal text-graphite-500">- {workOrder.assignedResource.type}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-graphite-500">
            Sem responsavel definido. Defina pelo quadro de Programacao, arrastando a OS para a pessoa e o dia.
          </p>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs uppercase tracking-wide text-graphite-400">Equipe de apoio</p>
        {(workOrder.assignees ?? []).length === 0 ? (
          <p className="text-sm text-graphite-500">Ninguem alem do responsavel.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(workOrder.assignees ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-graphite-800">
                  {a.laborResource?.name} <span className="text-graphite-500">- {a.laborResource?.type}</span>
                </span>
                {canManage && !isCompleted && (
                  <button onClick={() => handleRemove(a.id)} className="text-graphite-400 hover:text-safety-red" aria-label="Remover da equipe">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {canManage && !isCompleted && (
        <div className="flex flex-wrap items-end gap-2">
          <LaborResourcePicker
            className="flex-1"
            placeholder="Adicionar a equipe..."
            name="resourceId"
            value={resourceId}
            onChange={(e) => setResourceId(e.target.value)}
            clientId={workOrder.clientId}
            excludeIds={jaNaEquipe}
          />
          <button type="button" className="btn-outline" onClick={handleAdd} disabled={busy || !resourceId}>
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Substituir equipamento": retira o avariado, registra data/motivo/condicao/horimetro,
 * manda para quarentena (ou estoque se nao precisar de reparo), instala o reserva
 * compativel no mesmo local funcional e abre a ordem de reparo do retirado - tudo numa
 * unica operacao transacional no backend (POST /rotable-equipment/substituir), pra nunca
 * deixar um equipamento "desaparecido" ou instalado em dois lugares ao mesmo tempo.
 */
function SubstituteRotableModal({ workOrder, onClose, onDone }: { workOrder: MaintenanceWorkOrder; onClose: () => void; onDone: () => void }) {
  const { notify } = useToast();
  // So' pode existir um equipamento instalado por ativo por vez (a instalacao ja bloqueia
  // isso) - entao nao precisa de selecao, so' o que a consulta abaixo achar.
  const outgoingRotableId = workOrder.rotableEquipment?.id ?? "";
  const [incomingRotableId, setIncomingRotableId] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const [conditionAtRemoval, setConditionAtRemoval] = useState("");
  const [meterReadingAtRemoval, setMeterReadingAtRemoval] = useState("");
  const [meterReadingAtInstall, setMeterReadingAtInstall] = useState("");
  const [openRepairOrder, setOpenRepairOrder] = useState(true);
  const [defectReported, setDefectReported] = useState("");
  const [failureCodeId, setFailureCodeId] = useState("");
  const [vendor, setVendor] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: instalados } = useQuery({
    queryKey: ["rotable-instalados-no-ativo", workOrder.instrumentId],
    queryFn: () => listRotableEquipment({ instrumentId: workOrder.instrumentId, status: "INSTALLED", pageSize: 10 }),
  });
  const outgoing: RotableEquipment | undefined =
    instalados?.items.find((r) => r.id === outgoingRotableId) ?? instalados?.items[0];

  const { data: reservas } = useQuery({
    queryKey: ["rotable-em-estoque", workOrder.clientId, outgoing?.type],
    queryFn: () => listRotableEquipment({ clientId: workOrder.clientId, status: "IN_STOCK", type: outgoing?.type, pageSize: 50 }),
    enabled: !!outgoing?.type,
  });

  const { data: failureCodes } = useQuery({ queryKey: ["failure-codes-picker"], queryFn: () => listFailureCodes({ active: true }) });

  async function submit() {
    if (!outgoing) {
      notify("error", "Este ativo nao tem equipamento recondicionavel instalado agora.");
      return;
    }
    if (!incomingRotableId) {
      notify("error", "Falta preencher: Equipamento reserva.");
      return;
    }
    setSaving(true);
    try {
      await substituteRotableEquipment({
        workOrderId: workOrder.id,
        outgoingRotableId: outgoing.id,
        incomingRotableId,
        removalReason: removalReason || null,
        conditionAtRemoval: conditionAtRemoval || null,
        meterReadingAtRemoval: meterReadingAtRemoval ? Number(meterReadingAtRemoval) : null,
        meterReadingAtInstall: meterReadingAtInstall ? Number(meterReadingAtInstall) : null,
        openRepairOrder,
        repairOrder: openRepairOrder ? { defectReported: defectReported || null, failureCodeId: failureCodeId || null, vendor: vendor || null } : null,
      });
      notify("success", "Equipamento substituido.");
      onDone();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Substituir equipamento"
      size="lg"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={saving || !outgoing} onClick={() => void submit()}>
            {saving ? "Substituindo..." : "Confirmar substituicao"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {!instalados ? (
          <p className="text-sm text-graphite-500">Carregando...</p>
        ) : !outgoing ? (
          <p className="text-sm text-safety-red">Este ativo nao tem equipamento recondicionavel instalado agora - nao ha o que substituir.</p>
        ) : (
          <>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-graphite-400">Retirando</p>
              <p className="font-medium text-navy-900">{outgoing.code} - {outgoing.type}{outgoing.serialNumber ? ` (S/N ${outgoing.serialNumber})` : ""}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Motivo da retirada" placeholder="Ex.: falha, quebra, preventiva" value={removalReason} onChange={(e) => setRemovalReason(e.target.value)} />
              <TextInput label="Condicao na retirada" placeholder="Ex.: rolamento gripado" value={conditionAtRemoval} onChange={(e) => setConditionAtRemoval(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Horimetro na retirada" type="number" value={meterReadingAtRemoval} onChange={(e) => setMeterReadingAtRemoval(e.target.value)} />
              <TextInput label="Horimetro do reserva na instalacao" type="number" value={meterReadingAtInstall} onChange={(e) => setMeterReadingAtInstall(e.target.value)} />
            </div>

            <SelectInput
              label="Equipamento reserva (compativel)"
              required
              placeholder={reservas && reservas.items.length === 0 ? "Nenhum equipamento em estoque deste tipo" : "Selecione"}
              options={(reservas?.items ?? []).map((r) => ({ value: r.id, label: `${r.code}${r.serialNumber ? ` - S/N ${r.serialNumber}` : ""}` }))}
              value={incomingRotableId}
              onChange={(e) => setIncomingRotableId(e.target.value)}
            />

            <CheckboxInput
              label="Abrir ordem de reparo para o equipamento retirado"
              checked={openRepairOrder}
              onChange={(e) => setOpenRepairOrder(e.target.checked)}
            />
            {openRepairOrder && (
              <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                <TextareaInput label="Defeito informado" rows={2} value={defectReported} onChange={(e) => setDefectReported(e.target.value)} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectInput
                    label="Codigo de falha (opcional)"
                    placeholder="Nao especificar"
                    options={(failureCodes ?? []).map((f) => ({ value: f.id, label: `${f.code} - ${f.description}` }))}
                    value={failureCodeId}
                    onChange={(e) => setFailureCodeId(e.target.value)}
                  />
                  <TextInput label="Empresa reparadora (opcional)" value={vendor} onChange={(e) => setVendor(e.target.value)} />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
