import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Gantt from "frappe-gantt";
// O "exports" do package.json da frappe-gantt so declara o "." (JS) - o subcaminho
// "./dist/frappe-gantt.css" nao esta la, entao o bundler recusa importa-lo direto do
// pacote ("Missing specifier"). Por isso o CSS foi copiado para ca (frappe-gantt 1.2.2);
// sem ele as barras/grade do SVG ficam sem cor nenhuma (preenchimento preto padrao do
// SVG), que e' exatamente a "barra preta gigante" cobrindo o grafico inteiro.
import "../../../styles/vendor/frappe-gantt.css";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Plus,
  Save,
  Trash2,
  Wrench,
  Link2,
  Workflow,
  X,
} from "lucide-react";
import {
  getSchedule,
  updateSchedule,
  saveTasks,
  generateWorkOrderFromTask,
  linkWorkOrderToTask,
  type TaskInput,
} from "../../../api/shutdownSchedules";
import { listMaintenanceWorkOrders } from "../../../api/maintenanceWorkOrders";
import { getInstrument } from "../../../api/instruments";
import type { MaintenanceWorkOrder, ShutdownDateException, ShutdownScheduleStatus, ShutdownTask } from "../../../api/types";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { StatusBadge } from "../../../components/StatusBadge";
import { Modal } from "../../../components/Modal";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";
import { useCmms } from "../../../lib/cmms";

interface EditorTask {
  key: string;
  id?: string;
  name: string;
  instrumentId: string | null;
  instrumentLabel: string | null;
  workOrderId: string | null;
  workOrderNumber: string | null;
  workOrderStatus: string | null;
  /** Nome de quem responde pela OS vinculada (recurso do PCM, ou tecnico) - so leitura,
   * vem sempre da OS, nao existe campo proprio pra editar aqui. */
  responsavelNome: string | null;
  /** Tarefa que precisa terminar antes desta comecar (sequencia tipo MS Project) - key de
   * outra linha do MESMO cronograma, nao um id de banco (pode apontar pra uma linha nova). */
  predecessorKey: string | null;
  lagDays: number;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  percentComplete: number;
  resources: string;
  notes: string;
  children: EditorTask[];
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function nomeDoResponsavel(w: { assignedResource?: { name: string } | null; technician?: { name: string } | null } | null | undefined): string | null {
  return w?.assignedResource?.name ?? w?.technician?.name ?? null;
}

// O resto do app (ficha da OS, "Janela planejada" etc.) mostra qualquer data/hora
// convertida pro fuso do navegador - pra "07:30" aparecer como "07:30" lá tambem (e nao
// 3h adiantado/atrasado), a combinacao de data+hora abaixo grava um instante UTC
// equivalente ao horario LOCAL digitado, igual a um <input type="datetime-local"> comum.
//
// Excecao: um registro gravado ANTES desta tela ganhar horario e' sempre meia-noite UTC
// exata (era so' "YYYY-MM-DD", sem hora nenhuma) - tratar esse como hora local
// desvirtuaria a DATA tambem (meia-noite UTC cai no dia anterior aqui no Brasil). Esses
// continuam lidos como "UTC puro" (so' a data importa, hora default 00:00/23:59); qualquer
// tarefa nova ou editada por aqui a partir de agora ja fica no formato local-consistente.
function ehMeiaNoiteUtcPura(iso: string): boolean {
  return /T00:00:00(\.000)?Z$/.test(iso);
}
function extrairData(iso: string): string {
  if (ehMeiaNoiteUtcPura(iso)) return iso.slice(0, 10);
  return dataLocalParaISO(new Date(iso));
}
function extrairHora(iso: string): string {
  if (ehMeiaNoiteUtcPura(iso)) return "00:00";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
/** So pro FIM: um registro antigo (meia-noite UTC pura, de antes desta tela ganhar
 * horario) na pratica significa "nenhum horario foi definido" - nao literalmente "termina
 * a meia-noite". Mostrar 23:59 evita a armadilha de editar so o horario de inicio e cair
 * num "termina antes de comecar" por causa desse resquicio. */
function extrairHoraFim(iso: string): string {
  if (ehMeiaNoiteUtcPura(iso)) return "23:59";
  return extrairHora(iso);
}
function combinarDataHora(data: string, hora: string): string {
  const [y, m, d] = data.split("-").map(Number);
  const [h, min] = (hora || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).toISOString();
}

function novaTarefa(horaInicio = "07:00", horaFim = "17:00"): EditorTask {
  const d = hoje();
  return {
    key: crypto.randomUUID(),
    name: "",
    instrumentId: null,
    instrumentLabel: null,
    workOrderId: null,
    workOrderNumber: null,
    workOrderStatus: null,
    responsavelNome: null,
    predecessorKey: null,
    lagDays: 0,
    startDate: d,
    startTime: horaInicio,
    endDate: d,
    endTime: horaFim,
    percentComplete: 0,
    resources: "",
    notes: "",
    children: [],
  };
}

function toEditorTree(tasks: ShutdownTask[]): EditorTask[] {
  const byId = new Map<string, EditorTask>();
  tasks.forEach((t) => {
    byId.set(t.id, {
      key: t.id,
      id: t.id,
      name: t.name,
      instrumentId: t.instrumentId,
      instrumentLabel: t.instrument ? (t.instrument.tag ?? t.instrument.description ?? t.instrument.type) : null,
      workOrderId: t.workOrderId,
      workOrderNumber: t.workOrder?.number ?? null,
      workOrderStatus: t.workOrder?.status ?? null,
      responsavelNome: nomeDoResponsavel(t.workOrder),
      // key de uma tarefa ja salva e' o proprio id - o predecessorTaskId (id de banco)
      // aponta certinho pra chave certa sem precisar de mapa nenhum.
      predecessorKey: t.predecessorTaskId,
      lagDays: t.lagDays,
      startDate: extrairData(t.startDate),
      startTime: extrairHora(t.startDate),
      endDate: extrairData(t.endDate),
      endTime: extrairHoraFim(t.endDate),
      percentComplete: t.percentComplete,
      resources: t.resources ?? "",
      notes: t.notes ?? "",
      children: [],
    });
  });
  const roots: EditorTask[] = [];
  tasks.forEach((t) => {
    const node = byId.get(t.id)!;
    if (t.parentTaskId && byId.has(t.parentTaskId)) byId.get(t.parentTaskId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

function cloneTree(nodes: EditorTask[]): EditorTask[] {
  return nodes.map((n) => ({ ...n, children: cloneTree(n.children) }));
}

function findNode(nodes: EditorTask[], key: string): EditorTask | null {
  for (const n of nodes) {
    if (n.key === key) return n;
    const found = findNode(n.children, key);
    if (found) return found;
  }
  return null;
}

interface Loc {
  siblings: EditorTask[];
  index: number;
  parentKey: string | null;
}

function findLoc(nodes: EditorTask[], key: string, parentKey: string | null = null): Loc | null {
  const idx = nodes.findIndex((n) => n.key === key);
  if (idx !== -1) return { siblings: nodes, index: idx, parentKey };
  for (const n of nodes) {
    const res = findLoc(n.children, key, n.key);
    if (res) return res;
  }
  return null;
}

function flattenAll(nodes: EditorTask[], list: EditorTask[] = []): EditorTask[] {
  for (const n of nodes) {
    list.push(n);
    flattenAll(n.children, list);
  }
  return list;
}

// Datas em "YYYY-MM-DD" tratadas como UTC puro (meio-dia nao entra em jogo) - assim somar
// dias nunca pula ou repete um dia por causa de horario de verao.
function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function paraISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function somarDias(d: string, dias: number): string {
  const dt = parseISO(d);
  dt.setUTCDate(dt.getUTCDate() + dias);
  return paraISO(dt);
}
function diferencaEmDias(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
}
function diaDaSemana(d: string): number {
  return parseISO(d).getUTCDay();
}

/** O frappe-gantt trabalha com Date em horario LOCAL (nao UTC, diferente do resto deste
 * arquivo) - essa conversao so' e' usada pra ler de volta o que a pessoa arrastou na
 * barra, pra nao voltar um dia errado por causa de fuso. */
function dataLocalParaISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "2026-09-14" -> "14/09" - so' pro resumo da tarefa recolhida, sem o ano (o cronograma
 * inteiro cabe tipicamente num unico ano). */
function formatarDataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Um dia especifico pode fugir do padrao semanal (parada trabalhada num sabado, por
 * exemplo) - a excecao, quando existe pra essa data, sempre vence o padrao. */
function ehDiaUtil(data: string, diasUteis: number[], excecoes: ShutdownDateException[]): boolean {
  const excecao = excecoes.find((e) => e.date === data);
  if (excecao) return excecao.working;
  return diasUteis.length === 0 || diasUteis.includes(diaDaSemana(data));
}

/** Primeira data depois de `fimDaPredecessora` que e' dia util (segundo o calendario do
 * cronograma - padrao semanal + excecoes pontuais), pulando `lagDays` dias uteis extras de
 * folga. Sem calendario configurado (lista vazia), todo dia conta como util. */
function proximaDataUtil(fimDaPredecessora: string, lagDays: number, diasUteis: number[], excecoes: ShutdownDateException[]): string {
  let atual = fimDaPredecessora;
  let passosQueFaltam = 1 + Math.max(0, lagDays);
  while (passosQueFaltam > 0) {
    atual = somarDias(atual, 1);
    if (ehDiaUtil(atual, diasUteis, excecoes)) passosQueFaltam--;
  }
  return atual;
}

/**
 * Reagenda toda tarefa que tem predecessora: comeca no primeiro dia util depois que a
 * predecessora termina (+ atraso configurado), preservando a duracao que a propria tarefa
 * ja tinha. Roda em passadas ate estabilizar (cobre cadeias A->B->C independente da ordem
 * das tarefas na arvore) - o limite de passadas evita loop infinito se alguem formar um
 * ciclo (A depende de B que depende de A).
 */
function aplicarSequencia(nodes: EditorTask[], diasUteis: number[], excecoes: ShutdownDateException[]) {
  const flat = flattenAll(nodes);
  const porKey = new Map(flat.map((t) => [t.key, t]));
  for (let passada = 0; passada <= flat.length; passada++) {
    let mudou = false;
    for (const t of flat) {
      if (!t.predecessorKey) continue;
      const predecessora = porKey.get(t.predecessorKey);
      if (!predecessora || predecessora === t) continue;
      const duracao = diferencaEmDias(t.startDate, t.endDate);
      const novoInicio = proximaDataUtil(predecessora.endDate, t.lagDays, diasUteis, excecoes);
      const novoFim = somarDias(novoInicio, duracao);
      if (novoInicio !== t.startDate || novoFim !== t.endDate) {
        t.startDate = novoInicio;
        t.endDate = novoFim;
        mudou = true;
      }
    }
    if (!mudou) break;
  }
}

function flattenForSave(nodes: EditorTask[], parentKey: string | null, list: TaskInput[], counter: { n: number }) {
  for (const node of nodes) {
    list.push({
      id: node.id,
      key: node.key,
      parentKey,
      predecessorKey: node.predecessorKey,
      lagDays: node.lagDays,
      name: node.name.trim() || "(sem nome)",
      instrumentId: node.instrumentId,
      workOrderId: node.workOrderId,
      startDate: combinarDataHora(node.startDate, node.startTime),
      endDate: combinarDataHora(node.endDate, node.endTime),
      percentComplete: node.percentComplete,
      resources: node.resources || null,
      notes: node.notes || null,
      sortOrder: counter.n++,
    });
    flattenForSave(node.children, node.key, list, counter);
  }
}

function collectWorkOrderIds(nodes: EditorTask[], set: Set<string>) {
  for (const node of nodes) {
    if (node.workOrderId) set.add(node.workOrderId);
    collectWorkOrderIds(node.children, set);
  }
}

function tarefaDeOs(os: MaintenanceWorkOrder): EditorTask {
  const base = novaTarefa();
  const inicio = os.plannedStart ?? os.scheduledDate ?? base.startDate;
  return {
    ...base,
    name: os.title || os.description,
    instrumentId: os.instrumentId,
    instrumentLabel: os.instrument ? (os.instrument.tag ?? os.instrument.description ?? os.instrument.type) : null,
    workOrderId: os.id,
    workOrderNumber: os.number,
    workOrderStatus: os.status,
    responsavelNome: nomeDoResponsavel(os),
    startDate: extrairData(inicio),
    startTime: extrairHora(inicio),
    endDate: extrairData(os.plannedEnd ?? inicio),
    endTime: extrairHoraFim(os.plannedEnd ?? inicio),
  };
}

function flattenForGantt(nodes: EditorTask[], depth: number, list: { task: EditorTask; depth: number }[]) {
  for (const node of nodes) {
    list.push({ task: node, depth });
    flattenForGantt(node.children, depth + 1, list);
  }
}

const STATUS_OPTIONS: { value: ShutdownScheduleStatus; label: string }[] = [
  { value: "PLANNING", label: "Planejamento" },
  { value: "IN_PROGRESS", label: "Em execucao" },
  { value: "DONE", label: "Concluido" },
];

// 0=domingo...6=sabado, igual ao Date.getUTCDay().
const DIAS_DA_SEMANA = [
  { valor: 1, sigla: "Seg" },
  { valor: 2, sigla: "Ter" },
  { valor: 3, sigla: "Qua" },
  { valor: 4, sigla: "Qui" },
  { valor: 5, sigla: "Sex" },
  { valor: 6, sigla: "Sab" },
  { valor: 0, sigla: "Dom" },
];

/**
 * Editor do cronograma de parada - lista de tarefas com hierarquia (grupo > tarefa),
 * datas e sequencia proprias, mais um Gantt de leitura logo abaixo. "Salvar" grava a
 * arvore inteira de uma vez; reabrir esta tela mais tarde carrega o que foi salvo.
 */
export default function ShutdownScheduleDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const { base } = useCmms();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const { data: schedule, isLoading } = useQuery({ queryKey: ["shutdown-schedule", id], queryFn: () => getSchedule(id) });

  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<ShutdownScheduleStatus>("PLANNING");
  const [workingWeekdays, setWorkingWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [shiftStart, setShiftStart] = useState("07:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [shift24h, setShift24h] = useState(false);
  const [dateExceptions, setDateExceptions] = useState<ShutdownDateException[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [assetModalKey, setAssetModalKey] = useState<string | null>(null);
  const [linkOsModalKey, setLinkOsModalKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [fromOsModalOpen, setFromOsModalOpen] = useState(false);

  useEffect(() => {
    if (schedule) {
      const diasUteisCarregados = schedule.workingWeekdays.length ? schedule.workingWeekdays : [1, 2, 3, 4, 5];
      const excecoesCarregadas = schedule.dateExceptions ?? [];
      const arvore = toEditorTree(schedule.tasks ?? []);
      // Reconcilia com o calendario assim que carrega - se uma excecao/atraso foi salva
      // meio a meio de outras edicoes (ou o calendario mudou por fora), a tela sempre
      // reflete o que o calendario atual manda, nao so' o que ficou gravado por ultimo.
      aplicarSequencia(arvore, diasUteisCarregados, excecoesCarregadas);
      setTasks(arvore);
      setName(schedule.name);
      setStatus(schedule.status);
      setWorkingWeekdays(diasUteisCarregados);
      setHoursPerDay(schedule.hoursPerDay || 8);
      setShiftStart(schedule.shiftStart || "07:00");
      setShiftEnd(schedule.shiftEnd || "17:00");
      setShift24h(schedule.shift24h);
      setDateExceptions(excecoesCarregadas);
      setDirty(false);
    }
  }, [schedule]);

  // Toda mudanca na arvore passa por aqui - clona (nunca muta o estado anterior direto) e,
  // depois da mutacao especifica, reaplica a sequencia (predecessora + atraso) pra quem
  // depende de uma tarefa que acabou de mudar de data ficar sempre coerente.
  function mutateTasks(fn: (clone: EditorTask[]) => void) {
    const clone = cloneTree(tasks);
    fn(clone);
    aplicarSequencia(clone, workingWeekdays, dateExceptions);
    setTasks(clone);
    setDirty(true);
  }

  // Troca no calendario (dias uteis ou excecoes de data) tambem pode empurrar datas - roda
  // a mesma reconciliacao sem precisar de nenhuma mudanca na arvore em si.
  function recalcularComCalendario(diasUteis: number[], excecoes: ShutdownDateException[]) {
    setTasks((prev) => {
      const clone = cloneTree(prev);
      aplicarSequencia(clone, diasUteis, excecoes);
      return clone;
    });
    setDirty(true);
  }

  const usedWorkOrderIds = useMemo(() => {
    const set = new Set<string>();
    collectWorkOrderIds(tasks, set);
    return set;
  }, [tasks]);

  const todasAsTarefas = useMemo(() => flattenAll(tasks).map((t) => ({ key: t.key, name: t.name })), [tasks]);

  function addTaskFromWorkOrder(os: MaintenanceWorkOrder) {
    mutateTasks((clone) => {
      clone.push(tarefaDeOs(os));
    });
  }

  function updateField(key: string, patch: Partial<EditorTask>) {
    mutateTasks((clone) => {
      const node = findNode(clone, key);
      if (node) Object.assign(node, patch);
    });
  }

  function addSiblingAfter(key: string | null) {
    mutateTasks((clone) => {
      if (key === null) {
        clone.push(novaTarefa(shiftStart, shiftEnd));
        return;
      }
      const loc = findLoc(clone, key);
      if (!loc) return;
      loc.siblings.splice(loc.index + 1, 0, novaTarefa(shiftStart, shiftEnd));
    });
  }

  function addChild(key: string) {
    mutateTasks((clone) => {
      const node = findNode(clone, key);
      if (!node) return;
      node.children.push(novaTarefa(shiftStart, shiftEnd));
    });
  }

  function removeSubtree(key: string) {
    mutateTasks((clone) => {
      const loc = findLoc(clone, key);
      if (!loc) return;
      loc.siblings.splice(loc.index, 1);
    });
  }

  function moveUp(key: string) {
    mutateTasks((clone) => {
      const loc = findLoc(clone, key);
      if (!loc || loc.index === 0) return;
      const [node] = loc.siblings.splice(loc.index, 1);
      loc.siblings.splice(loc.index - 1, 0, node);
    });
  }

  function moveDown(key: string) {
    mutateTasks((clone) => {
      const loc = findLoc(clone, key);
      if (!loc || loc.index === loc.siblings.length - 1) return;
      const [node] = loc.siblings.splice(loc.index, 1);
      loc.siblings.splice(loc.index + 1, 0, node);
    });
  }

  function indent(key: string) {
    mutateTasks((clone) => {
      const loc = findLoc(clone, key);
      if (!loc || loc.index === 0) return;
      const prevSibling = loc.siblings[loc.index - 1];
      const [node] = loc.siblings.splice(loc.index, 1);
      prevSibling.children.push(node);
    });
  }

  function outdent(key: string) {
    mutateTasks((clone) => {
      const loc = findLoc(clone, key);
      if (!loc || loc.parentKey === null) return;
      const parentLoc = findLoc(clone, loc.parentKey);
      if (!parentLoc) return;
      const [node] = loc.siblings.splice(loc.index, 1);
      parentLoc.siblings.splice(parentLoc.index + 1, 0, node);
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateSchedule(id, {
        name: name.trim() || schedule?.name,
        status,
        workingWeekdays,
        hoursPerDay,
        shiftStart,
        shiftEnd,
        shift24h,
        dateExceptions,
      });

      const list: TaskInput[] = [];
      flattenForSave(tasks, null, list, { n: 0 });
      await saveTasks(id, list);

      notify("success", "Cronograma salvo.");
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["shutdown-schedule", id] });
      queryClient.invalidateQueries({ queryKey: ["shutdown-schedules"] });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateOs(task: EditorTask) {
    if (!task.id) {
      notify("error", "Salve o cronograma antes de gerar a OS desta tarefa.");
      return;
    }
    setGeneratingKey(task.key);
    try {
      const os = await generateWorkOrderFromTask(id, task.id);
      updateField(task.key, { workOrderId: os.id, workOrderNumber: os.number, workOrderStatus: os.status, responsavelNome: null });
      notify("success", `OS ${os.number} gerada e vinculada.`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setGeneratingKey(null);
    }
  }

  async function handleUnlinkOs(task: EditorTask) {
    if (!task.id) {
      updateField(task.key, { workOrderId: null, workOrderNumber: null, workOrderStatus: null, responsavelNome: null });
      return;
    }
    try {
      await linkWorkOrderToTask(id, task.id, null);
      updateField(task.key, { workOrderId: null, workOrderNumber: null, workOrderStatus: null, responsavelNome: null });
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  const ganttRef = useRef<HTMLDivElement | null>(null);
  const ganttInstance = useRef<Gantt | null>(null);
  const ganttFlat = useMemo(() => {
    const list: { task: EditorTask; depth: number }[] = [];
    flattenForGantt(tasks, 0, list);
    return list.filter((r) => r.task.startDate && r.task.endDate);
  }, [tasks]);

  // "Ligar predecessora" no Gantt: clica numa barra (a predecessora), depois na outra (a
  // que depende dela). O callback do Gantt so' e' registrado UMA VEZ (na criacao do
  // grafico) - por isso le' tudo por ref, nunca direto do estado/das funcoes do render,
  // senao ficaria preso na versao de quando o grafico nasceu (closure velha).
  const [modoLigarPredecessora, setModoLigarPredecessora] = useState(false);
  const modoLigarRef = useRef(false);
  const origemLigarRef = useRef<string | null>(null);
  const updateFieldRef = useRef<(key: string, patch: Partial<EditorTask>) => void>(() => {});
  const notifyRef = useRef(notify);
  updateFieldRef.current = updateField;
  notifyRef.current = notify;

  function alternarModoLigar() {
    const novo = !modoLigarRef.current;
    modoLigarRef.current = novo;
    origemLigarRef.current = null;
    setModoLigarPredecessora(novo);
    if (novo) notify("success", "Clique numa tarefa (a predecessora) e depois na que depende dela.");
  }

  useEffect(() => {
    if (!ganttRef.current) return;
    if (ganttFlat.length === 0) {
      ganttRef.current.innerHTML = "";
      ganttInstance.current = null;
      return;
    }
    const ganttTasks = ganttFlat.map(({ task, depth }) => ({
      id: task.key,
      name: `${" ".repeat(depth)}${task.name || "(sem nome)"}${task.responsavelNome ? ` - ${task.responsavelNome}` : ""}`,
      start: task.startDate,
      end: task.endDate,
      progress: task.percentComplete,
      // Desenha a setinha de dependencia entre predecessora e sucessora, igual ao Project.
      dependencies: task.predecessorKey ?? "",
      custom_class: task.children.length > 0 ? "shutdown-gantt-group" : "",
    }));
    try {
      if (ganttInstance.current) {
        ganttInstance.current.refresh(ganttTasks);
      } else {
        ganttInstance.current = new Gantt(ganttRef.current, ganttTasks, {
          view_mode: "Day",
          readonly: false,
          // Datas arrastaveis na propria barra; progresso continua so' pelo campo "%
          // concluida" do formulario, pra nao confundir arraste com avanco.
          readonly_dates: false,
          readonly_progress: true,
          // A lib tem um jeito proprio (ingenuo) de empurrar quem depende ao mover a
          // predecessora - desligado porque quem cuida disso e' aplicarSequencia (que
          // conhece o calendario de dias uteis); os dois mexendo juntos so' brigariam.
          move_dependencies: false,
          bar_height: 28,
          // Numero fixo (nao "auto") em vez de deixar a lib encolher pro tamanho exato do
          // conteudo - com poucas tarefas isso deixava a caixa minusucula. Uma tela cheia de
          // altura da espaco de sobra sempre; com muitas tarefas o grid cresce alem disso
          // mesmo assim (a lib usa o MAIOR entre os dois), entao nada fica cortado.
          container_height: Math.max(500, Math.floor(window.innerHeight * 0.75)),
          on_date_change: (task: { id: string }, start: Date, end: Date) => {
            updateFieldRef.current(task.id, { startDate: dataLocalParaISO(start), endDate: dataLocalParaISO(end) });
          },
          on_click: (task: { id: string; name: string }) => {
            if (!modoLigarRef.current) return;
            if (!origemLigarRef.current) {
              origemLigarRef.current = task.id;
              notifyRef.current("success", `"${task.name}" marcada como predecessora - clique agora na tarefa que depende dela.`);
              return;
            }
            const predKey = origemLigarRef.current;
            origemLigarRef.current = null;
            if (predKey === task.id) {
              notifyRef.current("error", "Escolha uma tarefa diferente da predecessora.");
              return;
            }
            updateFieldRef.current(task.id, { predecessorKey: predKey });
            notifyRef.current("success", `"${task.name}" agora depende da tarefa marcada.`);
          },
        });
      }
    } catch {
      // Gantt lanca erro em estado transitorio incoerente (ex.: mudou o tipo de vista no
      // meio de uma atualizacao) - o proximo refresh corrige sozinho, nao precisa tratar.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ganttFlat]);

  if (isLoading || !schedule) return <FullPageSpinner />;

  const assetTask = assetModalKey ? findNode(tasks, assetModalKey) : null;
  const linkOsTask = linkOsModalKey ? findNode(tasks, linkOsModalKey) : null;

  return (
    <div>
      <PageHeader
        title={schedule.name}
        description="Cronograma tipo projeto: ativo, sequência, datas e OS de cada tarefa da parada"
        breadcrumbs={[
          { label: "RLP Maintenance CMMS", to: base },
          { label: "Cronogramas de parada", to: `${base}/cronogramas-parada` },
          { label: schedule.name },
        ]}
        actions={
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : dirty ? "Salvar alteracoes" : "Salvar"}
          </button>
        }
      />

      <div className="card mb-6 grid gap-4 p-5 sm:grid-cols-[1fr_220px]">
        <TextInput
          label="Nome do cronograma"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
        />
        <SelectInput
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => { setStatus(e.target.value as ShutdownScheduleStatus); setDirty(true); }}
        />
      </div>

      <div className="card mb-6 p-5">
        <p className="text-sm font-medium text-graphite-700">Calendário</p>
        <p className="mt-0.5 text-xs text-graphite-500">
          Usado so pelo reagendamento automatico (predecessora + atraso) pra saber que dias pular - nao limita a data/hora que voce pode digitar numa tarefa.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1 block text-sm font-medium text-graphite-700">Dias úteis (padrão semanal)</span>
            <div className="flex gap-1">
              {DIAS_DA_SEMANA.map((d) => {
                const ativo = workingWeekdays.includes(d.valor);
                return (
                  <button
                    key={d.valor}
                    type="button"
                    className={`h-9 w-11 rounded-md border text-xs font-medium transition-colors ${
                      ativo ? "border-navy-700 bg-navy-700 text-white" : "border-gray-200 bg-white text-graphite-500 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      const novo = ativo ? workingWeekdays.filter((v) => v !== d.valor) : [...workingWeekdays, d.valor];
                      if (novo.length === 0) return;
                      setWorkingWeekdays(novo);
                      recalcularComCalendario(novo, dateExceptions);
                    }}
                  >
                    {d.sigla}
                  </button>
                );
              })}
            </div>
          </div>
          <TextInput
            label="Horas de trabalho por dia"
            type="number"
            min={1}
            max={24}
            step="0.5"
            className="w-40"
            value={hoursPerDay}
            onChange={(e) => { setHoursPerDay(Number(e.target.value) || 8); setDirty(true); }}
          />
          <TextInput
            label="Expediente - início"
            type="time"
            className="w-36"
            disabled={shift24h}
            value={shiftStart}
            onChange={(e) => { setShiftStart(e.target.value); setDirty(true); }}
          />
          <TextInput
            label="Expediente - fim"
            type="time"
            className="w-36"
            disabled={shift24h}
            value={shiftEnd}
            onChange={(e) => { setShiftEnd(e.target.value); setDirty(true); }}
          />
          <label className="mb-2 flex items-center gap-2 text-sm text-graphite-700">
            <input type="checkbox" checked={shift24h} onChange={(e) => { setShift24h(e.target.checked); setDirty(true); }} />
            24 horas (turnos)
          </label>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-graphite-700">Excecoes de data</span>
            <button
              type="button"
              className="btn-outline btn-sm"
              onClick={() => {
                const novas = [...dateExceptions, { date: hoje(), working: false } as ShutdownDateException];
                setDateExceptions(novas);
                recalcularComCalendario(workingWeekdays, novas);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar excecao
            </button>
          </div>
          <p className="mt-0.5 text-xs text-graphite-500">
            Pra um dia especifico que foge do padrao - ex.: um sabado trabalhado so nesta parada, ou um dia parado no meio da semana.
          </p>
          {dateExceptions.length > 0 && (
            <div className="mt-3 space-y-2">
              {dateExceptions.map((exc, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2">
                  <input
                    type="date"
                    className="input w-40"
                    value={exc.date}
                    onChange={(e) => {
                      const novas = dateExceptions.map((x, j) => (j === i ? { ...x, date: e.target.value } : x));
                      setDateExceptions(novas);
                      recalcularComCalendario(workingWeekdays, novas);
                    }}
                  />
                  <select
                    className="input w-40"
                    value={exc.working ? "1" : "0"}
                    onChange={(e) => {
                      const novas = dateExceptions.map((x, j) => (j === i ? { ...x, working: e.target.value === "1" } : x));
                      setDateExceptions(novas);
                      recalcularComCalendario(workingWeekdays, novas);
                    }}
                  >
                    <option value="0">Não é dia útil</option>
                    <option value="1">É dia útil</option>
                  </select>
                  {exc.working && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-graphite-600">
                        <input
                          type="checkbox"
                          checked={!!exc.shift24h}
                          onChange={(e) => setDateExceptions(dateExceptions.map((x, j) => (j === i ? { ...x, shift24h: e.target.checked } : x)))}
                        />
                        24h
                      </label>
                      {!exc.shift24h && (
                        <>
                          <input
                            type="time"
                            className="input w-28"
                            placeholder="Início"
                            value={exc.shiftStart ?? ""}
                            onChange={(e) => setDateExceptions(dateExceptions.map((x, j) => (j === i ? { ...x, shiftStart: e.target.value } : x)))}
                          />
                          <input
                            type="time"
                            className="input w-28"
                            placeholder="Fim"
                            value={exc.shiftEnd ?? ""}
                            onChange={(e) => setDateExceptions(dateExceptions.map((x, j) => (j === i ? { ...x, shiftEnd: e.target.value } : x)))}
                          />
                        </>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    className="icon-btn ml-auto text-graphite-400 hover:text-safety-red"
                    title="Remover exceção"
                    onClick={() => {
                      const novas = dateExceptions.filter((_, j) => j !== i);
                      setDateExceptions(novas);
                      recalcularComCalendario(workingWeekdays, novas);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-navy-900">Tarefas ({ganttFlat.length})</h2>
        <div className="flex gap-2">
          <button className="btn-outline btn-sm" onClick={() => setFromOsModalOpen(true)}>
            <ClipboardList className="h-4 w-4" /> Tarefa a partir de OS
          </button>
          <button className="btn-outline btn-sm" onClick={() => addSiblingAfter(null)}>
            <Plus className="h-4 w-4" /> Nova tarefa
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <div className="card p-8 text-center text-sm text-graphite-500">
            Nenhuma tarefa ainda. Clique em "Nova tarefa" para comecar a montar a sequencia.
          </div>
        )}
        {tasks.map((task, i) => (
          <TaskRow
            key={task.key}
            task={task}
            depth={0}
            isFirst={i === 0}
            isLast={i === tasks.length - 1}
            generatingKey={generatingKey}
            allTasks={todasAsTarefas}
            onUpdate={updateField}
            onAddSibling={addSiblingAfter}
            onAddChild={addChild}
            onRemove={setRemoveKey}
            onMoveUp={moveUp}
            onMoveDown={moveDown}
            onIndent={indent}
            onOutdent={outdent}
            onPickAsset={setAssetModalKey}
            onGenerateOs={handleGenerateOs}
            onLinkOs={setLinkOsModalKey}
            onUnlinkOs={handleUnlinkOs}
          />
        ))}
      </div>

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-navy-900">Gantt</h2>
          <button
            type="button"
            className={`btn-sm inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
              modoLigarPredecessora ? "border-safety-yellow-dark bg-safety-yellow text-navy-950" : "btn-outline"
            }`}
            onClick={alternarModoLigar}
          >
            <Workflow className="h-3.5 w-3.5" />
            {modoLigarPredecessora ? "Clique na predecessora, depois na dependente..." : "Ligar predecessora no Gantt"}
          </button>
        </div>
        <p className="mb-3 text-xs text-graphite-500">
          Arraste uma barra pra mudar a data dela. Redimensione pela borda pra mudar a duracao.
        </p>
        {ganttFlat.length === 0 ? (
          <div className="card p-8 text-center text-sm text-graphite-500">
            Adicione tarefas com data de inicio e fim para ver o Gantt.
          </div>
        ) : (
          <div className="card overflow-x-auto p-4">
            <div ref={ganttRef} />
          </div>
        )}
      </div>

      {assetTask && (
        <Modal open onClose={() => setAssetModalKey(null)} title="Ativo da tarefa" size="sm">
          <InstrumentPicker
            label="Ativo"
            clientId={schedule.clientId}
            name="instrumentId"
            value={assetTask.instrumentId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              const key = assetTask.key;
              if (!val) {
                updateField(key, { instrumentId: null, instrumentLabel: null });
                return;
              }
              updateField(key, { instrumentId: val, instrumentLabel: "Carregando..." });
              getInstrument(val)
                .then((inst) => updateField(key, { instrumentLabel: inst.tag ?? inst.description ?? inst.type }))
                .catch(() => updateField(key, { instrumentLabel: "Ativo selecionado" }));
            }}
          />
          <div className="mt-4 flex justify-end">
            <button className="btn-primary" onClick={() => setAssetModalKey(null)}>Fechar</button>
          </div>
        </Modal>
      )}

      {linkOsTask && (
        <LinkWorkOrderModal
          clientId={schedule.clientId}
          instrumentId={linkOsTask.instrumentId}
          onClose={() => setLinkOsModalKey(null)}
          onPick={async (os) => {
            const patch = { workOrderId: os.id, workOrderNumber: os.number, workOrderStatus: os.status, responsavelNome: nomeDoResponsavel(os) };
            if (!linkOsTask.id) {
              updateField(linkOsTask.key, patch);
              setLinkOsModalKey(null);
              return;
            }
            try {
              await linkWorkOrderToTask(id, linkOsTask.id, os.id);
              updateField(linkOsTask.key, patch);
              notify("success", `OS ${os.number} vinculada.`);
            } catch (error) {
              notify("error", getApiErrorMessage(error));
            } finally {
              setLinkOsModalKey(null);
            }
          }}
        />
      )}

      {fromOsModalOpen && (
        <PickWorkOrdersModal
          clientId={schedule.clientId}
          usedIds={usedWorkOrderIds}
          onClose={() => setFromOsModalOpen(false)}
          onPick={addTaskFromWorkOrder}
        />
      )}

      <ConfirmDialog
        open={!!removeKey}
        title="Remover tarefa"
        description="Remove esta tarefa e todas as subtarefas dela. Só passa a valer depois de Salvar."
        confirmLabel="Remover"
        danger
        onConfirm={() => { if (removeKey) removeSubtree(removeKey); setRemoveKey(null); }}
        onCancel={() => setRemoveKey(null)}
      />
    </div>
  );
}

function TaskRow({
  task,
  depth,
  isFirst,
  isLast,
  generatingKey,
  allTasks,
  onUpdate,
  onAddSibling,
  onAddChild,
  onRemove,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  onPickAsset,
  onGenerateOs,
  onLinkOs,
  onUnlinkOs,
}: {
  task: EditorTask;
  depth: number;
  isFirst: boolean;
  isLast: boolean;
  generatingKey: string | null;
  allTasks: { key: string; name: string }[];
  onUpdate: (key: string, patch: Partial<EditorTask>) => void;
  onAddSibling: (key: string) => void;
  onAddChild: (key: string) => void;
  onRemove: (key: string) => void;
  onMoveUp: (key: string) => void;
  onMoveDown: (key: string) => void;
  onIndent: (key: string) => void;
  onOutdent: (key: string) => void;
  onPickAsset: (key: string) => void;
  onGenerateOs: (task: EditorTask) => void;
  onLinkOs: (key: string) => void;
  onUnlinkOs: (task: EditorTask) => void;
}) {
  const opcoesDePredecessora = allTasks.filter((t) => t.key !== task.key);
  const temPredecessora = !!task.predecessorKey;
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <div className="card p-4" style={{ marginLeft: depth * 24 }}>
        <button type="button" className="flex w-full items-center gap-2 text-left" onClick={() => setAberto((a) => !a)}>
          {aberto ? <ChevronDown className="h-4 w-4 shrink-0 text-graphite-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-graphite-400" />}
          <span className="min-w-0 flex-1 truncate font-medium text-navy-900">{task.name || "(sem nome)"}</span>
          {task.workOrderNumber && <span className="shrink-0 rounded-full bg-navy-50 px-2 py-0.5 text-xs font-medium text-navy-700">OS {task.workOrderNumber}</span>}
          {task.instrumentLabel && <span className="hidden shrink-0 text-xs text-graphite-400 sm:inline">{task.instrumentLabel}</span>}
          <span className="shrink-0 text-xs text-graphite-400">
            {formatarDataCurta(task.startDate)} {task.startTime} - {formatarDataCurta(task.endDate)} {task.endTime}
          </span>
        </button>

        {aberto && (
        <>
        <div className="mb-3 mt-4 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
          <button className="icon-btn" title="Subir" disabled={isFirst} onClick={() => onMoveUp(task.key)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="icon-btn" title="Descer" disabled={isLast} onClick={() => onMoveDown(task.key)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button className="icon-btn" title="Indentar (virar subtarefa)" disabled={isFirst} onClick={() => onIndent(task.key)}>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
          <button className="icon-btn" title="Desindentar" disabled={depth === 0} onClick={() => onOutdent(task.key)}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span className="mx-1 h-4 w-px bg-gray-200" />
          <button className="icon-btn" title="Nova tarefa abaixo" onClick={() => onAddSibling(task.key)}>
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button className="btn-outline btn-sm" onClick={() => onAddChild(task.key)}>
            <Plus className="h-3.5 w-3.5" /> Subtarefa
          </button>
          <button className="icon-btn ml-auto text-graphite-400 hover:text-safety-red" title="Remover" onClick={() => onRemove(task.key)}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextInput
            label="Nome da tarefa"
            className="lg:col-span-2"
            value={task.name}
            onChange={(e) => onUpdate(task.key, { name: e.target.value })}
          />
          <div>
            <label className="mb-1 block text-sm font-medium text-graphite-700">Ativo</label>
            <button
              type="button"
              className="input flex w-full items-center justify-between text-left"
              onClick={() => onPickAsset(task.key)}
            >
              <span className={task.instrumentId ? "text-graphite-800" : "text-graphite-400"}>
                {task.instrumentLabel ?? (task.instrumentId ? "Ativo selecionado" : "Selecionar ativo")}
              </span>
            </button>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-graphite-700">Ordem de servico</label>
            {task.workOrderId ? (
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-graphite-800">OS {task.workOrderNumber}</span>
                {task.workOrderStatus && <StatusBadge status={task.workOrderStatus} />}
                <button type="button" className="shrink-0 text-graphite-400 hover:text-safety-red" onClick={() => onUnlinkOs(task)} aria-label="Desvincular OS">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <button type="button" className="btn-outline btn-sm flex-1" disabled={generatingKey === task.key} onClick={() => onGenerateOs(task)}>
                  <Wrench className="h-3.5 w-3.5" /> {generatingKey === task.key ? "Gerando..." : "Gerar OS"}
                </button>
                <button type="button" className="btn-outline btn-sm flex-1" onClick={() => onLinkOs(task.key)}>
                  <Link2 className="h-3.5 w-3.5" /> Vincular
                </button>
              </div>
            )}
            {task.workOrderId && (
              <p className="mt-1 text-xs text-graphite-500">
                Responsável: {task.responsavelNome ?? <span className="italic text-graphite-400">não atribuído na OS</span>}
              </p>
            )}
          </div>

          <SelectInput
            label="Predecessora"
            hint="Começa só depois que a predecessora termina."
            placeholder="Sem predecessora (data manual)"
            options={opcoesDePredecessora.map((t) => ({ value: t.key, label: t.name || "(sem nome)" }))}
            value={task.predecessorKey ?? ""}
            onChange={(e) => onUpdate(task.key, { predecessorKey: e.target.value || null })}
          />
          {temPredecessora && (
            <TextInput
              label="Atraso (dias úteis)"
              type="number"
              min={0}
              value={task.lagDays}
              onChange={(e) => onUpdate(task.key, { lagDays: Math.max(0, Number(e.target.value) || 0) })}
            />
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-graphite-700">Início</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                className="input"
                value={task.startDate}
                disabled={temPredecessora}
                title={temPredecessora ? "Calculado a partir da predecessora - remova a predecessora para editar a mao." : undefined}
                onChange={(e) => onUpdate(task.key, { startDate: e.target.value })}
              />
              <input
                type="time"
                className="input w-28"
                disabled={temPredecessora}
                value={task.startTime}
                onChange={(e) => onUpdate(task.key, { startTime: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-graphite-700">Fim</label>
            <div className="flex gap-1.5">
              <input type="date" className="input" value={task.endDate} onChange={(e) => onUpdate(task.key, { endDate: e.target.value })} />
              <input type="time" className="input w-28" value={task.endTime} onChange={(e) => onUpdate(task.key, { endTime: e.target.value })} />
            </div>
          </div>
          <TextInput
            label="% concluida"
            type="number"
            min={0}
            max={100}
            value={task.percentComplete}
            onChange={(e) => onUpdate(task.key, { percentComplete: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
          />
          <TextInput
            label="Recursos / equipe"
            placeholder="Ex.: ELETRICA;JULIANO"
            value={task.resources}
            onChange={(e) => onUpdate(task.key, { resources: e.target.value })}
          />
          <TextInput
            label="Observacoes"
            className="lg:col-span-2"
            value={task.notes}
            onChange={(e) => onUpdate(task.key, { notes: e.target.value })}
          />
        </div>
        </>
        )}
      </div>

      {task.children.map((child, i) => (
        <TaskRow
          key={child.key}
          task={child}
          depth={depth + 1}
          isFirst={i === 0}
          isLast={i === task.children.length - 1}
          generatingKey={generatingKey}
          allTasks={allTasks}
          onUpdate={onUpdate}
          onAddSibling={onAddSibling}
          onAddChild={onAddChild}
          onRemove={onRemove}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onIndent={onIndent}
          onOutdent={onOutdent}
          onPickAsset={onPickAsset}
          onGenerateOs={onGenerateOs}
          onLinkOs={onLinkOs}
          onUnlinkOs={onUnlinkOs}
        />
      ))}
    </>
  );
}

// A OS ja concluida ou cancelada nao serve pra planejar nada daqui pra frente - nenhum
// dos dois seletores de OS do cronograma deve oferecer ela.
const STATUS_FORA_DO_SELETOR = new Set(["COMPLETED", "CANCELED"]);

function LinkWorkOrderModal({
  clientId,
  instrumentId,
  onClose,
  onPick,
}: {
  clientId: string;
  instrumentId: string | null;
  onClose: () => void;
  onPick: (os: MaintenanceWorkOrder) => void;
}) {
  const [search, setSearch] = useState("");
  const [filtroAtivoId, setFiltroAtivoId] = useState(instrumentId ?? "");
  const { data, isFetching } = useQuery({
    queryKey: ["work-orders-link-picker", clientId, filtroAtivoId, search],
    queryFn: () => listMaintenanceWorkOrders({ clientId, instrumentId: filtroAtivoId || undefined, search: search || undefined, pageSize: 30 }),
  });
  const itens = (data?.items ?? []).filter((os) => !STATUS_FORA_DO_SELETOR.has(os.status));

  return (
    <Modal open onClose={onClose} title="Vincular OS existente" size="md">
      <div className="space-y-3">
        <InstrumentPicker label="Filtrar por ativo (opcional)" clientId={clientId} name="filtroAtivo" value={filtroAtivoId} onChange={(e) => setFiltroAtivoId(e.target.value)} />
        <TextInput placeholder="Buscar por número ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-200">
        {isFetching ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Buscando...</p>
        ) : itens.length === 0 ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Nenhuma OS encontrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((os) => (
              <li key={os.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => onPick(os)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-navy-900">OS {os.number}</span>
                    <span className="block truncate text-xs text-graphite-400">
                      {os.title || os.description}
                      {nomeDoResponsavel(os) ? ` - ${nomeDoResponsavel(os)}` : ""}
                    </span>
                  </span>
                  <StatusBadge status={os.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/**
 * "Cada OS e' uma tarefa": em vez de criar uma tarefa em branco e depois vincular a OS,
 * aqui a pessoa escolhe direto entre as OS ja existentes - cada uma clicada vira uma nova
 * tarefa, ja com nome, ativo e janela de data puxados da propria OS. O modal fica aberto
 * entre um clique e outro para escolher varias de uma vez; as ja adicionadas ficam
 * marcadas, pra nao duplicar a mesma OS em duas tarefas sem querer.
 */
function PickWorkOrdersModal({
  clientId,
  usedIds,
  onClose,
  onPick,
}: {
  clientId: string;
  usedIds: Set<string>;
  onClose: () => void;
  onPick: (os: MaintenanceWorkOrder) => void;
}) {
  const [search, setSearch] = useState("");
  const [filtroAtivoId, setFiltroAtivoId] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["work-orders-from-os-picker", clientId, filtroAtivoId, search],
    queryFn: () => listMaintenanceWorkOrders({ clientId, instrumentId: filtroAtivoId || undefined, search: search || undefined, pageSize: 30 }),
  });
  const itens = (data?.items ?? []).filter((os) => !STATUS_FORA_DO_SELETOR.has(os.status));

  return (
    <Modal open onClose={onClose} title="Adicionar tarefas a partir de OS" size="md">
      <p className="mb-3 text-xs text-graphite-500">Clique numa OS para criá-la como tarefa. Pode escolher várias antes de fechar.</p>
      <div className="space-y-3">
        <InstrumentPicker label="Filtrar por ativo (opcional)" clientId={clientId} name="filtroAtivo" value={filtroAtivoId} onChange={(e) => setFiltroAtivoId(e.target.value)} />
        <TextInput placeholder="Buscar por número ou descrição" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="mt-3 max-h-96 overflow-y-auto rounded-lg border border-gray-200">
        {isFetching ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Buscando...</p>
        ) : itens.length === 0 ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Nenhuma OS encontrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {itens.map((os) => {
              const usada = usedIds.has(os.id);
              return (
                <li key={os.id}>
                  <button
                    type="button"
                    disabled={usada}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => onPick(os)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-900">OS {os.number}</span>
                      <span className="block truncate text-xs text-graphite-400">
                        {(os.title || os.description)} {os.instrument ? `- ${os.instrument.tag ?? os.instrument.description}` : ""}
                        {nomeDoResponsavel(os) ? ` - ${nomeDoResponsavel(os)}` : ""}
                      </span>
                    </span>
                    {usada ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-safety-green-dark">
                        <Check className="h-4 w-4" /> Adicionada
                      </span>
                    ) : (
                      <StatusBadge status={os.status} />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button className="btn-primary" onClick={onClose}>Concluir</button>
      </div>
    </Modal>
  );
}
