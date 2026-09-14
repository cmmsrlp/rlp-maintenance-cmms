import { api } from "./client";
import type { ShutdownDateException, ShutdownSchedule, ShutdownScheduleStatus, ShutdownTask } from "./types";

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export async function listSchedules(params: {
  clientId?: string;
  status?: ShutdownScheduleStatus;
  search?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<PagedResult<ShutdownSchedule>> {
  const { data } = await api.get<PagedResult<ShutdownSchedule>>("/shutdown-schedules", { params });
  return data;
}

export async function getSchedule(id: string): Promise<ShutdownSchedule> {
  const { data } = await api.get<ShutdownSchedule>(`/shutdown-schedules/${id}`);
  return data;
}

export interface ScheduleInput {
  clientId?: string;
  name: string;
  status?: ShutdownScheduleStatus;
  notes?: string | null;
  workingWeekdays?: number[];
  hoursPerDay?: number;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  shift24h?: boolean;
  dateExceptions?: ShutdownDateException[];
}

export async function createSchedule(input: ScheduleInput): Promise<ShutdownSchedule> {
  const { data } = await api.post<ShutdownSchedule>("/shutdown-schedules", input);
  return data;
}

export async function updateSchedule(id: string, input: Partial<ScheduleInput>): Promise<ShutdownSchedule> {
  const { data } = await api.patch<ShutdownSchedule>(`/shutdown-schedules/${id}`, input);
  return data;
}

export async function deleteSchedule(id: string): Promise<void> {
  await api.delete(`/shutdown-schedules/${id}`);
}

export interface TaskInput {
  id?: string;
  key: string;
  parentKey?: string | null;
  predecessorKey?: string | null;
  lagDays?: number;
  name: string;
  instrumentId?: string | null;
  workOrderId?: string | null;
  startDate: string;
  endDate: string;
  percentComplete?: number;
  resources?: string | null;
  notes?: string | null;
  sortOrder: number;
}

export async function saveTasks(scheduleId: string, tasks: TaskInput[]): Promise<ShutdownTask[]> {
  const { data } = await api.put<ShutdownTask[]>(`/shutdown-schedules/${scheduleId}/tarefas`, { tasks });
  return data;
}

export async function generateWorkOrderFromTask(scheduleId: string, taskId: string): Promise<{ id: string; number: string; status: string; type: string }> {
  const { data } = await api.post(`/shutdown-schedules/${scheduleId}/tarefas/${taskId}/gerar-os`);
  return data;
}

export async function linkWorkOrderToTask(scheduleId: string, taskId: string, workOrderId: string | null): Promise<ShutdownTask> {
  const { data } = await api.post<ShutdownTask>(`/shutdown-schedules/${scheduleId}/tarefas/${taskId}/vincular-os`, { workOrderId });
  return data;
}
