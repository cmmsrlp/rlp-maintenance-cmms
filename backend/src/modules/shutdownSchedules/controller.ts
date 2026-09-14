import type { Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, resolveClientId } from "../../middleware/rbac";
import { nextClientMaintenanceOrderNumber } from "../../utils/sequence";

/**
 * Cronograma de parada programada: uma lista de tarefas com hierarquia (grupo > tarefa),
 * sequencia e datas proprias, no espirito de um Gantt de MS Project - ver comentario no
 * schema.prisma para o raciocinio completo (datas manuais, sem motor de reagendamento).
 */

const scheduleSelect = {
  id: true,
  clientId: true,
  name: true,
  status: true,
  notes: true,
  workingWeekdays: true,
  hoursPerDay: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const listSchedules = asyncHandler(async (req: Request, res: Response) => {
  const { clientId: queryClientId, status, search } = req.query as { clientId?: string; status?: string; search?: string };
  const clientId = resolveClientId(req, queryClientId);
  const pageParams = parsePageParams(req.query);

  const where = {
    clientId,
    deletedAt: null,
    ...(status ? { status: status as never } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.shutdownSchedule.findMany({
      where,
      select: {
        ...scheduleSelect,
        _count: { select: { tasks: true } },
        tasks: { select: { startDate: true, endDate: true }, orderBy: { startDate: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(pageParams),
    }),
    prisma.shutdownSchedule.count({ where }),
  ]);

  // Inicio/fim do cronograma sao derivados das tarefas (menor inicio, maior fim) - nao um
  // campo proprio que a pessoa preencheria a mao e que poderia destoar do que as tarefas
  // realmente cobrem.
  const comPeriodo = items.map(({ tasks, ...s }) => ({
    ...s,
    taskCount: s._count.tasks,
    startDate: tasks.length ? tasks[0].startDate : null,
    endDate: tasks.length ? tasks.reduce((max, t) => (t.endDate > max ? t.endDate : max), tasks[0].endDate) : null,
  }));

  res.json(buildPagedResult(comPeriodo, total, pageParams));
});

const taskWithRelations = {
  instrument: { select: { id: true, tag: true, description: true, type: true } },
  workOrder: {
    select: {
      id: true,
      number: true,
      status: true,
      type: true,
      // Responsavel: o recurso do quadro do PCM (assignedResource) e' quem a ficha da OS
      // chama de "Responsavel" - o tecnico (login) so entra de reserva quando a OS nao tem
      // recurso atribuido.
      assignedResource: { select: { id: true, name: true } },
      technician: { select: { id: true, name: true } },
    },
  },
} as const;

const taskSelectFields = {
  id: true,
  parentTaskId: true,
  predecessorTaskId: true,
  lagDays: true,
  name: true,
  instrumentId: true,
  workOrderId: true,
  startDate: true,
  endDate: true,
  percentComplete: true,
  resources: true,
  notes: true,
  sortOrder: true,
  ...taskWithRelations,
} as const;

export const getSchedule = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await prisma.shutdownSchedule.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: {
      ...scheduleSelect,
      tasks: { orderBy: [{ sortOrder: "asc" }], select: taskSelectFields },
    },
  });
  if (!schedule) throw new NotFoundError("Cronograma de parada");
  res.json(schedule);
});

const scheduleSchema = z.object({
  clientId: z.string().uuid().optional(),
  name: z.string().min(2, "De um nome para o cronograma."),
  status: z.enum(["PLANNING", "IN_PROGRESS", "DONE"]).optional(),
  notes: z.string().nullish(),
  // 0=domingo...6=sabado.
  workingWeekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  hoursPerDay: z.coerce.number().positive().max(24).optional(),
});

export const createSchedule = asyncHandler(async (req: Request, res: Response) => {
  const data = scheduleSchema.parse(req.body);
  const clientId = resolveClientId(req, data.clientId);

  const schedule = await prisma.shutdownSchedule.create({
    data: {
      name: data.name,
      status: data.status,
      notes: data.notes,
      workingWeekdays: data.workingWeekdays,
      hoursPerDay: data.hoursPerDay,
      clientId,
      createdById: req.user?.sub,
    },
    select: scheduleSelect,
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "ShutdownSchedule",
    entityId: schedule.id,
    description: `Cronograma de parada "${schedule.name}" criado`,
  });

  res.status(201).json({ ...schedule, taskCount: 0, startDate: null, endDate: null });
});

export const updateSchedule = asyncHandler(async (req: Request, res: Response) => {
  const data = scheduleSchema.partial().omit({ clientId: true }).parse(req.body);
  const existing = await prisma.shutdownSchedule.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Cronograma de parada");

  const schedule = await prisma.shutdownSchedule.update({ where: { id: existing.id }, data, select: scheduleSelect });
  res.json(schedule);
});

export const deleteSchedule = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.shutdownSchedule.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Cronograma de parada");

  await prisma.shutdownSchedule.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "ShutdownSchedule",
    entityId: existing.id,
    description: `Cronograma de parada "${existing.name}" removido`,
  });
  res.status(204).send();
});

const taskInputSchema = z.object({
  // id existente (edicao) ou ausente (linha nova) - key e' sempre enviada pelo front, gerada
  // no navegador, para a hierarquia (parentKey) se referir a uma linha nova nesta mesma
  // gravacao, antes dela ter um id de banco.
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  parentKey: z.string().nullish(),
  // Mesma logica do parentKey: aponta pra "key" de outra linha desta mesma gravacao (pode
  // ser uma tarefa nova, sem id de banco ainda).
  predecessorKey: z.string().nullish(),
  lagDays: z.coerce.number().int().min(0).optional(),
  name: z.string().min(1, "De um nome para a tarefa."),
  instrumentId: z.string().uuid().nullish(),
  workOrderId: z.string().uuid().nullish(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  percentComplete: z.coerce.number().min(0).max(100).optional(),
  resources: z.string().nullish(),
  notes: z.string().nullish(),
  sortOrder: z.coerce.number().int(),
});

const bulkTasksSchema = z.object({ tasks: z.array(taskInputSchema) });

/**
 * Salva a arvore inteira de tarefas de uma vez (o botao "Salvar" do editor tipo planilha):
 * substitui o que existir no banco pelo que o editor tem em memoria agora. Duas passadas
 * numa transacao so' - grava tudo com parentTaskId nulo primeiro (evita depender da ordem
 * de criacao para resolver referencia entre linhas), depois liga cada linha ao pai usando o
 * mapa key -> id resolvido na primeira passada.
 */
export const saveTasks = asyncHandler(async (req: Request, res: Response) => {
  const { tasks } = bulkTasksSchema.parse(req.body);
  const schedule = await prisma.shutdownSchedule.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!schedule) throw new NotFoundError("Cronograma de parada");

  for (const t of tasks) {
    if (t.endDate < t.startDate) throw new ValidationError(`A tarefa "${t.name}" termina antes de comecar.`);
  }
  if (tasks.some((t) => t.instrumentId)) {
    const ids = [...new Set(tasks.map((t) => t.instrumentId).filter((v): v is string => !!v))];
    const validos = await prisma.instrument.count({ where: { id: { in: ids }, clientId: schedule.clientId, deletedAt: null } });
    if (validos !== ids.length) throw new ValidationError("Algum ativo escolhido nao pertence a esta empresa.");
  }

  await prisma.$transaction(async (tx) => {
    const keyParaId = new Map<string, string>();
    for (const t of tasks) {
      const id = t.id ?? randomUUID();
      keyParaId.set(t.key, id);
      await tx.shutdownTask.upsert({
        where: { id },
        create: {
          id,
          scheduleId: schedule.id,
          name: t.name,
          instrumentId: t.instrumentId ?? null,
          workOrderId: t.workOrderId ?? null,
          startDate: t.startDate,
          endDate: t.endDate,
          percentComplete: t.percentComplete ?? 0,
          resources: t.resources ?? null,
          notes: t.notes ?? null,
          sortOrder: t.sortOrder,
          lagDays: t.lagDays ?? 0,
        },
        update: {
          name: t.name,
          instrumentId: t.instrumentId ?? null,
          workOrderId: t.workOrderId ?? null,
          startDate: t.startDate,
          endDate: t.endDate,
          percentComplete: t.percentComplete ?? 0,
          resources: t.resources ?? null,
          notes: t.notes ?? null,
          sortOrder: t.sortOrder,
          lagDays: t.lagDays ?? 0,
        },
      });
    }

    // Linhas que existiam no banco mas nao vieram nesta gravacao - a pessoa apagou no editor.
    const idsQuePermanecem = tasks.map((t) => keyParaId.get(t.key)!);
    await tx.shutdownTask.deleteMany({ where: { scheduleId: schedule.id, id: { notIn: idsQuePermanecem.length ? idsQuePermanecem : ["__none__"] } } });

    // So depois de toda linha existir e' que da pra ligar parentTaskId/predecessorTaskId -
    // uma tarefa nova pode apontar pra outra tarefa nova desta mesma gravacao.
    for (const t of tasks) {
      const parentId = t.parentKey ? keyParaId.get(t.parentKey) ?? null : null;
      const predecessorId = t.predecessorKey ? keyParaId.get(t.predecessorKey) ?? null : null;
      await tx.shutdownTask.update({ where: { id: keyParaId.get(t.key)! }, data: { parentTaskId: parentId, predecessorTaskId: predecessorId } });
    }
  });

  const atualizado = await prisma.shutdownTask.findMany({
    where: { scheduleId: schedule.id },
    orderBy: [{ sortOrder: "asc" }],
    select: taskSelectFields,
  });
  res.json(atualizado);
});

/** Botao "Gerar OS" de uma tarefa: cria uma OS de manutencao (tipo Projeto) ja preenchida
 * com o ativo, nome e janela da tarefa, e liga ela na tarefa - tudo numa transacao so'. */
export const generateWorkOrderFromTask = asyncHandler(async (req: Request, res: Response) => {
  const schedule = await prisma.shutdownSchedule.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!schedule) throw new NotFoundError("Cronograma de parada");

  const task = await prisma.shutdownTask.findFirst({ where: { id: req.params.taskId, scheduleId: schedule.id } });
  if (!task) throw new NotFoundError("Tarefa do cronograma");
  if (task.workOrderId) throw new ValidationError("Esta tarefa ja tem uma OS vinculada.");
  if (!task.instrumentId) throw new ValidationError("Escolha o ativo da tarefa antes de gerar a OS.");

  const instrument = await prisma.instrument.findFirst({ where: { id: task.instrumentId, deletedAt: null }, select: { clientId: true, costCenterId: true } });
  if (!instrument || instrument.clientId !== schedule.clientId) throw new ValidationError("Ativo invalido para esta empresa.");

  const workOrder = await prisma.$transaction(async (tx) => {
    const number = await nextClientMaintenanceOrderNumber(schedule.clientId);
    const os = await tx.maintenanceWorkOrder.create({
      data: {
        clientId: schedule.clientId,
        number,
        instrumentId: task.instrumentId!,
        costCenterId: instrument.costCenterId,
        type: "PROJECT",
        status: "PLANNED",
        title: task.name,
        description: task.name,
        plannedStart: task.startDate,
        plannedEnd: task.endDate,
        scheduledDate: task.startDate,
        createdById: req.user?.sub,
      },
      select: { id: true, number: true, status: true, type: true },
    });
    await tx.shutdownTask.update({ where: { id: task.id }, data: { workOrderId: os.id } });
    return os;
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "MaintenanceWorkOrder",
    entityId: workOrder.id,
    description: `OS ${workOrder.number} gerada a partir da tarefa "${task.name}" do cronograma de parada`,
  });

  res.status(201).json(workOrder);
});

/** Vincula uma OS ja existente na tarefa (sem criar nada novo) - ou desvincula, com
 * workOrderId: null. */
export const linkWorkOrderToTask = asyncHandler(async (req: Request, res: Response) => {
  const { workOrderId } = z.object({ workOrderId: z.string().uuid().nullable() }).parse(req.body);
  const schedule = await prisma.shutdownSchedule.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!schedule) throw new NotFoundError("Cronograma de parada");

  const task = await prisma.shutdownTask.findFirst({ where: { id: req.params.taskId, scheduleId: schedule.id } });
  if (!task) throw new NotFoundError("Tarefa do cronograma");

  if (workOrderId) {
    const os = await prisma.maintenanceWorkOrder.findFirst({ where: { id: workOrderId, deletedAt: null }, select: { clientId: true } });
    if (!os) throw new NotFoundError("Ordem de servico");
    if (os.clientId !== schedule.clientId) throw new ValidationError("Essa OS pertence a outra empresa.");
  }

  const updated = await prisma.shutdownTask.update({
    where: { id: task.id },
    data: { workOrderId },
    select: { id: true, workOrderId: true, ...taskWithRelations },
  });
  res.json(updated);
});
