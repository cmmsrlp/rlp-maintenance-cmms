import { useEffect, useState } from "react";
import { NavLink, Outlet, Link } from "react-router-dom";
import { Menu, X, LogOut, ChevronDown, ReceiptText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getOwnClient } from "../api/clients";
import { useAuth } from "../auth/AuthContext";
import { getPortalNav, PORTAL_NAV_PADRAO_FECHADO } from "./portalNav";
import { CmmsLogo } from "../components/CmmsLogo";
import { AssistantWidget } from "../components/AssistantWidget";
import { clientDisplayName } from "../lib/format";

const COLLAPSE_KEY = "optiprocess-portal-sidebar-collapsed";
const SECOES_KEY = "optiprocess-portal-secoes-fechadas";

export function ClientPortalLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  // Preferencia por dispositivo (aberto/fechado) - guardada so no navegador, nao no
  // perfil do usuario, entao cada computador/celular lembra do proprio jeito.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { user, logout } = useAuth();

  // O contrato do proprio cliente - so para o rotulo do cabecalho, e o logo da empresa na
  // barra lateral. Em cache longo: nao e' informacao que muda no meio da navegacao. Toda a
  // equipe do cliente ve (o logo e' da empresa, nao so de quem administra); o ADMIN em
  // acesso master nao tem contrato proprio, e o Solicitante nao entra aqui.
  const { data: contrato } = useQuery({
    queryKey: ["own-client"],
    queryFn: getOwnClient,
    enabled: ["CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN"].includes(user?.role ?? "") && !!user?.clientId,
    staleTime: 300_000,
  });

  // Quais secoes o usuario deixou fechadas. Guardado no navegador dele: cada um usa o
  // sistema de um jeito, e reabrir tudo a cada visita e' trabalho repetido.
  const [secoesFechadas, setSecoesFechadas] = useState<string[]>(() => {
    try {
      const salvo = localStorage.getItem(SECOES_KEY);
      if (salvo) return JSON.parse(salvo) as string[];
    } catch {
      // Sem localStorage (aba anonima, etc.): usa o padrao de cada secao.
    }
    return PORTAL_NAV_PADRAO_FECHADO;
  });

  function alternarSecao(titulo: string) {
    setSecoesFechadas((atual) => {
      const proximo = atual.includes(titulo) ? atual.filter((t) => t !== titulo) : [...atual, titulo];
      try {
        localStorage.setItem(SECOES_KEY, JSON.stringify(proximo));
      } catch {
        // Sem localStorage: funciona na sessao, so nao persiste.
      }
      return proximo;
    });
  }
  const contractedServices = user?.client?.contractedServices ?? [];
  const portalNav = getPortalNav(contractedServices, user?.role);
  // O logo do produto continua sempre presente - o da empresa entra do lado, nao no lugar
  // dele, com um traco separando os dois. Sem logo cadastrado, fica so o do produto, como
  // sempre foi.
  const brand = (size: "sm" | "md") => (
    <span className="flex min-w-0 items-center gap-2.5">
      <CmmsLogo variant="light" size={size} />
      {contrato?.logoUrl && (
        <>
          <span className="h-6 w-px shrink-0 bg-navy-700" aria-hidden="true" />
          <img
            src={contrato.logoUrl}
            alt={clientDisplayName(user?.client)}
            className={`w-auto shrink-0 object-contain ${size === "sm" ? "h-6 max-w-[3.5rem]" : "h-8 max-w-[5rem]"}`}
          />
        </>
      )}
    </span>
  );

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      // Sem localStorage disponivel (aba anonima, etc.) - so nao persiste, sem quebrar.
    }
  }, [collapsed]);

  const nav = (isCollapsed: boolean) => (
    <nav className="flex flex-col gap-0.5 px-3 py-4">
      {portalNav.map((section, index) => {
        // Com a barra estreita nao ha titulo para clicar, entao tudo fica aberto - senao os
        // itens some sem nada que explique como traze-los de volta.
        const aberta = isCollapsed || !section.title || !secoesFechadas.includes(section.title);
        return (
        <div key={section.title ?? `section-${index}`} className={index > 0 ? "mt-4" : ""}>
          {section.title &&
            (isCollapsed ? (
              <div className="mx-3 mb-1 border-t border-navy-800" />
            ) : (
              <button
                type="button"
                onClick={() => alternarSecao(section.title!)}
                aria-expanded={aberta}
                /* O cabecalho tem o mesmo formato de um item de menu - icone a esquerda,
                   mesma altura, mesmo espacamento - para a coluna de icones ficar alinhada
                   de cima a baixo. O que o distingue e' o peso do texto e a seta a direita;
                   o anel de foco so aparece para quem navega por teclado, porque o outline
                   amarelo padrao no clique fazia o titulo parecer um campo quebrado. */
                className="mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold tracking-wide text-navy-200 outline-none transition-colors hover:bg-navy-800/60 hover:text-white focus-visible:ring-1 focus-visible:ring-navy-500"
              >
                {section.icon && <section.icon className="h-4.5 w-4.5 shrink-0 text-navy-400" />}
                <span className="min-w-0 truncate">{section.title}</span>
                {!aberta && (
                  <span className="shrink-0 rounded-full bg-navy-800 px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-navy-300">
                    {section.items.length}
                  </span>
                )}
                <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-navy-500 transition-transform ${aberta ? "" : "-rotate-90"}`} />
              </button>
            ))}
          {/* Itens de uma secao entram recuados, com um fio a esquerda: sem isso ficavam
              alinhados com o proprio titulo e nada dizia que estavam dentro dele. Na barra
              estreita nao ha recuo - os icones ficam centralizados e nao ha hierarquia
              visivel para marcar. */}
          <div
            className={`flex flex-col gap-0.5 ${aberta ? "" : "hidden"} ${
              section.title && !isCollapsed ? "ml-[18px] border-l border-navy-800 pl-1.5" : ""
            }`}
          >
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/portal" || item.exact}
                onClick={() => setMobileOpen(false)}
                title={isCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isCollapsed ? "justify-center" : ""} ${
                    isActive ? "bg-navy-800 text-safety-yellow" : "text-navy-200 hover:bg-navy-800/60 hover:text-white"
                  }`
                }
              >
                <item.icon className="h-4.5 w-4.5 shrink-0" />
                {!isCollapsed && item.label}
              </NavLink>
            ))}
          </div>
        </div>
        );
      })}
      <button
        type="button"
        onClick={() => logout()}
        title={isCollapsed ? "Sair" : undefined}
        className={`mt-4 flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-300 hover:bg-navy-800/60 ${isCollapsed ? "justify-center" : ""}`}
      >
        <LogOut className="h-4.5 w-4.5 shrink-0" /> {!isCollapsed && "Sair"}
      </button>
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className={`hidden shrink-0 bg-navy-950 transition-[width] duration-150 lg:block ${collapsed ? "w-16" : "w-64"}`}>
        <div className="sticky top-0 h-screen overflow-y-auto overflow-x-hidden">
          <div className={`flex h-16 items-center ${collapsed ? "justify-center px-2" : "px-5"}`}>
            {!collapsed && (
              <Link to="/portal" aria-label="RLP Maintenance">
                {brand("sm")}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={`text-navy-300 hover:text-white ${collapsed ? "" : "ml-auto"}`}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
          {nav(collapsed)}
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-navy-950 shadow-xl">
            <div className="flex h-16 items-center px-5">
              {brand("sm")}
              <button type="button" className="ml-auto text-navy-300" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-4 sm:px-6">
          <button type="button" className="text-graphite-600 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-navy-900">{clientDisplayName(user?.client)}</p>
            <p className="text-xs text-graphite-500">RLP Maintenance</p>
          </div>

          {/* O plano contratado no cabecalho, sempre visivel: ele estava so no rodape do
              menu, em "Meu contrato", e quem precisava saber quantas vagas ainda tem nao
              achava. Aqui e' tambem o atalho para a tela inteira. */}
          <Link
            to="/portal/contrato"
            className="hidden shrink-0 items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-xs hover:border-navy-300 hover:bg-gray-50 sm:flex"
            title="Ver o contrato, os acessos e quanto ainda cabe"
          >
            <ReceiptText className="h-3.5 w-3.5 text-graphite-400" />
            {contrato?.plan ? (
              <>
                <span className="font-medium text-navy-900">{contrato.plan.name}</span>
                {contrato.planUsage?.users.limit != null && (
                  <span className="text-graphite-500">
                    {contrato.planUsage.users.current}/{contrato.planUsage.users.limit} acessos
                  </span>
                )}
              </>
            ) : (
              <span className="text-graphite-500">Sem plano definido</span>
            )}
          </Link>
          <AssistantWidget />
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
