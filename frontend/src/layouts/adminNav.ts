import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Building2,
  Gauge,
  Users,
  History,
  Wrench,
  Layers3,
} from "lucide-react";
import type { Role } from "../api/types";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
}

export const ADMIN_NAV: NavItem[] = [
  { to: "/gestao", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "TECHNICIAN", "COMMERCIAL"] },
  { to: "/gestao/clientes", label: "Clientes", icon: Building2, roles: ["ADMIN", "TECHNICIAN", "COMMERCIAL"] },
  { to: "/gestao/ativos", label: "Ativos", icon: Gauge, roles: ["ADMIN", "TECHNICIAN", "COMMERCIAL"] },
  { to: "/gestao/manutencao", label: "CMMS", icon: Wrench, roles: ["ADMIN"] },
  { to: "/gestao/usuarios", label: "Usuarios e perfis", icon: Users, roles: ["ADMIN"] },
  { to: "/gestao/auditoria", label: "Auditoria", icon: History, roles: ["ADMIN"] },
  { to: "/gestao/plataforma", label: "Administracao da plataforma", icon: Layers3, roles: ["ADMIN"] },
];
