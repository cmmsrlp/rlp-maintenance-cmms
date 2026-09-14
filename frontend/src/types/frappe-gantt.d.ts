declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    custom_class?: string;
  }

  export interface GanttOptions {
    view_mode?: "Day" | "Week" | "Month";
    view_mode_select?: boolean;
    readonly?: boolean;
    readonly_dates?: boolean;
    readonly_progress?: boolean;
    bar_height?: number;
    padding?: number;
    container_height?: number | "auto";
    on_click?: (task: GanttTask) => void;
    popup_on_click?: (task: GanttTask) => boolean | void;
  }

  export default class Gantt {
    constructor(wrapper: string | HTMLElement, tasks: GanttTask[], options?: GanttOptions);
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode: string): void;
  }
}
