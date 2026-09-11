import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, Search, Bell, LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { globalSearch } from "../api/search";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications";
import { formatRole, formatDateTime } from "../lib/format";

export function AdminTopbar({ onOpenMobileMenu }: { onOpenMobileMenu: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const { data: searchResults } = useQuery({
    queryKey: ["global-search", searchTerm],
    queryFn: () => globalSearch(searchTerm),
    enabled: searchTerm.trim().length >= 2,
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handleNotificationClick(id: string, link: string | null) {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    setNotifOpen(false);
    if (link) navigate(link);
  }

  const hasResults = searchResults && (searchResults.clients.length > 0 || searchResults.instruments.length > 0);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 sm:px-6">
      <button type="button" className="text-graphite-600 lg:hidden" onClick={onOpenMobileMenu} aria-label="Abrir menu">
        <Menu className="h-6 w-6" />
      </button>

      <div ref={searchRef} className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
        <input
          type="search"
          placeholder="Buscar clientes ou ativos..."
          className="input pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => setSearchOpen(true)}
        />
        {searchOpen && searchTerm.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-full mt-1 max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
            {!hasResults && <p className="px-2 py-3 text-sm text-graphite-500">Nenhum resultado encontrado.</p>}
            {searchResults?.clients.map((c) => (
              <button
                key={c.id}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-navy-50"
                onClick={() => {
                  navigate(`/gestao/clientes/${c.id}`);
                  setSearchOpen(false);
                }}
              >
                <span className="text-xs uppercase text-graphite-400">Cliente</span> · {c.tradeName || c.companyName}
              </button>
            ))}
            {searchResults?.instruments.map((i) => (
              <button
                key={i.id}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-navy-50"
                onClick={() => {
                  navigate(`/gestao/ativos/${i.id}`);
                  setSearchOpen(false);
                }}
              >
                <span className="text-xs uppercase text-graphite-400">Ativo</span> · {i.model} ({i.serialNumber})
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={notifRef} className="relative">
        <button
          type="button"
          className="relative rounded-full p-2 text-graphite-600 hover:bg-gray-100"
          onClick={() => setNotifOpen((v) => !v)}
          aria-label="Notificacoes"
        >
          <Bell className="h-5 w-5" />
          {!!notifications?.unreadCount && (
            <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-safety-red text-[10px] font-bold text-white">
              {notifications.unreadCount > 9 ? "9+" : notifications.unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-1 max-h-96 w-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <span className="text-sm font-semibold text-navy-900">Notificacoes</span>
              <button type="button" className="text-xs text-navy-600 hover:underline" onClick={handleMarkAllRead}>
                Marcar todas como lidas
              </button>
            </div>
            {notifications?.items.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-graphite-500">Sem notificacoes por aqui.</p>
            )}
            {notifications?.items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n.id, n.link)}
                className={`block w-full border-b border-gray-50 px-3 py-2.5 text-left text-sm hover:bg-navy-50 ${
                  n.read ? "text-graphite-500" : "font-medium text-graphite-900"
                }`}
              >
                <p>{n.title}</p>
                <p className="mt-0.5 text-xs text-graphite-400">{formatDateTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={userRef} className="relative">
        <button
          type="button"
          className="flex items-center gap-2 rounded-full bg-gray-100 py-1 pl-1 pr-3 text-sm hover:bg-gray-200"
          onClick={() => setUserMenuOpen((v) => !v)}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
            {user?.name?.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden text-graphite-700 sm:inline">{user?.name}</span>
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2">
              <p className="text-sm font-medium text-graphite-900">{user?.name}</p>
              <p className="text-xs text-graphite-500">{user ? formatRole(user.role) : ""}</p>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-graphite-700 hover:bg-gray-50"
              onClick={() => {
                setUserMenuOpen(false);
                navigate("/gestao/perfil");
              }}
            >
              <UserIcon className="h-4 w-4" /> Meu perfil
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-safety-red hover:bg-red-50"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
