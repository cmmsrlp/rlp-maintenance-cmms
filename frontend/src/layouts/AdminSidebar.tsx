import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { ADMIN_NAV } from "./adminNav";
import { CmmsLogo } from "../components/CmmsLogo";

const COLLAPSE_KEY = "optiprocess-admin-sidebar-collapsed";

export function AdminSidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { user } = useAuth();
  const items = ADMIN_NAV.filter((item) => !user || item.roles.includes(user.role));
  // Preferencia por dispositivo (aberto/fechado) - guardada so no navegador.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // Sem localStorage disponivel - so nao persiste, sem quebrar.
    }
  }, [collapsed]);

  function content(isCollapsed: boolean) {
    return (
      <>
        <div className={`flex h-16 items-center ${isCollapsed ? "justify-center px-2" : "px-5"}`}>
          {!isCollapsed && <CmmsLogo variant="dark" size="sm" />}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={`hidden text-graphite-400 hover:text-navy-700 lg:block ${isCollapsed ? "" : "ml-auto"}`}
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <Menu className="h-5 w-5" />
          </button>
          <button type="button" className="ml-auto text-graphite-400 lg:hidden" onClick={onCloseMobile} aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5 px-3 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/gestao"}
              onClick={onCloseMobile}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isCollapsed ? "justify-center" : ""} ${
                  isActive ? "bg-navy-50 text-navy-700" : "text-graphite-600 hover:bg-graphite-50 hover:text-navy-800"
                }`
              }
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {!isCollapsed && item.label}
            </NavLink>
          ))}
        </nav>
      </>
    );
  }

  return (
    <>
      <aside className={`hidden shrink-0 border-r border-gray-200 bg-white transition-[width] duration-150 lg:block ${collapsed ? "w-16" : "w-64"}`}>
        <div className="sticky top-0 h-screen overflow-y-auto overflow-x-hidden">{content(collapsed)}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-white shadow-xl">{content(false)}</aside>
        </div>
      )}
    </>
  );
}
