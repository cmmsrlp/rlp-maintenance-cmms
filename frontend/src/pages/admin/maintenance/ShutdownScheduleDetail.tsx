import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Gantt from "frappe-gantt";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Wrench,
  Link2,
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
import type { ShutdownScheduleStatus, ShutdownTask } from "../../../api/types";
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
  startDate: string;
  endDate: string;
  percentComplete: number;
  resources: string;
  notes: string;
  children: EditorTask[];
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function novaTarefa(): EditorTask {
  const d = hoje();
  return {
    key: crypto.randomUUID(),
    name: "",
    instrumentId: null,
    instrumentLabel: null,
    workOrderId: null,
    workOrderNumber: null,
    workOrderStatus: null,
    startDate: d,
    endDate: d,
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
      startDate: t.startDate.slice(0, 10),
      endDate: t.endDate.slice(0, 10),
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

function updateNode(nodes: EditorTask[], key: string, patch: Partial<EditorTask>): EditorTask[] {
  return nodes.map((n) =>
    n.key === key ? { ...n, ...patch } : n.children.length ? { ...n, children: updateNode(n.children, key, patch) } : n,
  );
}

function flattenForSave(nodes: EditorTask[], parentKey: string | null, list: TaskInput[], counter: { n: number }) {
  for (const node of nodes) {
    list.push({
      id: node.id,
      key: node.key,
      parentKey,
      name: node.name.trim() || "(sem nome)",
      instrumentId: node.instrumentId,
      workOrderId: node.workOrderId,
      startDate: node.startDate,
      endDate: node.endDate,
      percentComplete: node.percentComplete,
      resources: node.resources || null,
      notes: node.notes || null,
      sortOrder: counter.n++,
    });
    flattenForSave(node.children, node.key, list, counter);
  }
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
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [assetModalKey, setAssetModalKey] = useState<string | null>(null);
  const [linkOsModalKey, setLinkOsModalKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);

  useEffect(() => {
    if (schedule) {
      setTasks(toEditorTree(schedule.tasks ?? []));
      setName(schedule.name);
      setStatus(schedule.status);
      setDirty(false);
    }
  }, [schedule]);

  function mutateTasks(fn: (clone: EditorTask[]) => void) {
    const clone = cloneTree(tasks);
    fn(clone);
    setTasks(clone);
    setDirty(true);
  }

  function updateField(key: string, patch: Partial<EditorTask>) {
    setTasks((prev) => updateNode(prev, key, patch));
    setDirty(true);
  }

  function addSiblingAfter(key: string | null) {
    mutateTasks((clone) => {
      if (key === null) {
        clone.push(novaTarefa());
        return;
      }
      const loc = findLoc(clone, key);
      if (!loc) return;
      loc.siblings.splice(loc.index + 1, 0, novaTarefa());
    });
  }

  function addChild(key: string) {
    mutateTasks((clone) => {
      const node = findNode(clone, key);
      if (!node) return;
      node.children.push(novaTarefa());
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
      if (name.trim() && name !== schedule?.name) await updateSchedule(id, { name: name.trim() });
      if (status !== schedule?.status) await updateSchedule(id, { status });

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
      updateField(task.key, { workOrderId: os.id, workOrderNumber: os.number, workOrderStatus: os.status });
      notify("success", `OS ${os.number} gerada e vinculada.`);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    } finally {
      setGeneratingKey(null);
    }
  }

  async function handleUnlinkOs(task: EditorTask) {
    if (!task.id) {
      updateField(task.key, { workOrderId: null, workOrderNumber: null, workOrderStatus: null });
      return;
    }
    try {
      await linkWorkOrderToTask(id, task.id, null);
      updateField(task.key, { workOrderId: null, workOrderNumber: null, workOrderStatus: null });
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

  useEffect(() => {
    if (!ganttRef.current) return;
    if (ganttFlat.length === 0) {
      ganttRef.current.innerHTML = "";
      ganttInstance.current = null;
      return;
    }
    const ganttTasks = ganttFlat.map(({ task, depth }) => ({
      id: task.key,
      name: `${" ".repeat(depth)}${task.name || "(sem nome)"}`,
      start: task.startDate,
      end: task.endDate,
      progress: task.percentComplete,
      custom_class: task.children.length > 0 ? "shutdown-gantt-group" : "",
    }));
    try {
      if (ganttInstance.current) {
        ganttInstance.current.refresh(ganttTasks);
      } else {
        ganttInstance.current = new Gantt(ganttRef.current, ganttTasks, {
          view_mode: "Day",
          readonly: true,
          readonly_dates: true,
          readonly_progress: true,
          bar_height: 24,
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
        description="Cronograma tipo projeto: ativo, sequencia, datas e OS de cada tarefa da parada"
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-navy-900">Tarefas ({ganttFlat.length})</h2>
        <button className="btn-outline btn-sm" onClick={() => addSiblingAfter(null)}>
          <Plus className="h-4 w-4" /> Nova tarefa
        </button>
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
        <h2 className="mb-3 font-semibold text-navy-900">Gantt</h2>
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
            if (!linkOsTask.id) {
              updateField(linkOsTask.key, { workOrderId: os.id, workOrderNumber: os.number, workOrderStatus: os.status });
              setLinkOsModalKey(null);
              return;
            }
            try {
              await linkWorkOrderToTask(id, linkOsTask.id, os.id);
              updateField(linkOsTask.key, { workOrderId: os.id, workOrderNumber: os.number, workOrderStatus: os.status });
              notify("success", `OS ${os.number} vinculada.`);
            } catch (error) {
              notify("error", getApiErrorMessage(error));
            } finally {
              setLinkOsModalKey(null);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={!!removeKey}
        title="Remover tarefa"
        description="Remove esta tarefa e todas as subtarefas dela. So passa a valer depois de Salvar."
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
  return (
    <>
      <div className="card p-4" style={{ marginLeft: depth * 24 }}>
        <div className="mb-3 flex flex-wrap items-center gap-1">
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
          </div>

          <TextInput
            label="Inicio"
            type="date"
            value={task.startDate}
            onChange={(e) => onUpdate(task.key, { startDate: e.target.value })}
          />
          <TextInput
            label="Fim"
            type="date"
            value={task.endDate}
            onChange={(e) => onUpdate(task.key, { endDate: e.target.value })}
          />
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
      </div>

      {task.children.map((child, i) => (
        <TaskRow
          key={child.key}
          task={child}
          depth={depth + 1}
          isFirst={i === 0}
          isLast={i === task.children.length - 1}
          generatingKey={generatingKey}
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

function LinkWorkOrderModal({
  clientId,
  instrumentId,
  onClose,
  onPick,
}: {
  clientId: string;
  instrumentId: string | null;
  onClose: () => void;
  onPick: (os: { id: string; number: string; status: string }) => void;
}) {
  const [search, setSearch] = useState("");
  const { data, isFetching } = useQuery({
    queryKey: ["work-orders-link-picker", clientId, instrumentId, search],
    queryFn: () => listMaintenanceWorkOrders({ clientId, instrumentId: instrumentId ?? undefined, search: search || undefined, pageSize: 15 }),
  });

  return (
    <Modal open onClose={onClose} title="Vincular OS existente" size="md">
      <TextInput placeholder="Buscar por numero ou descricao" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-gray-200">
        {isFetching ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Buscando...</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <p className="px-3 py-3 text-sm text-graphite-500">Nenhuma OS encontrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data!.items.map((os) => (
              <li key={os.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => onPick({ id: os.id, number: os.number, status: os.status })}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-navy-900">OS {os.number}</span>
                    <span className="block truncate text-xs text-graphite-400">{os.title || os.description}</span>
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
