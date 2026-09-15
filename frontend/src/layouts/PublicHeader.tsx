import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";
import { CmmsLogo } from "../components/CmmsLogo";
import { buildWhatsAppLink } from "../lib/publicContact";

const QUEM_SOMOS_LINK = { href: "#quem-somos", label: "Quem somos" };

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#indicadores", label: "Indicadores" },
];

const RECURSOS_LINKS = [
  { to: "/gestao-de-ativos", label: "Gestão de ativos" },
  { to: "/manutencao-preditiva", label: "Manutenção preditiva" },
  { to: "/almoxarifado-tecnico", label: "Almoxarifado técnico" },
  { to: "/equipamentos-recondicionaveis", label: "Equipamentos recondicionáveis" },
  { to: "/lubrificacao", label: "Lubrificação" },
  { to: "/falhas-e-causa-raiz", label: "Falhas e causa raiz" },
  { to: "/portal-do-cliente", label: "Portal do cliente" },
];

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [recursosOpen, setRecursosOpen] = useState(false);
  const location = useLocation();
  const emHome = location.pathname === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0" onClick={() => setOpen(false)}>
          <CmmsLogo variant="dark" size="sm" />
        </Link>

        <nav className="hidden items-center gap-9 md:flex">
          <a
            href={emHome ? QUEM_SOMOS_LINK.href : `/${QUEM_SOMOS_LINK.href}`}
            className="text-sm font-semibold text-graphite-700 transition-colors hover:text-navy-900"
          >
            {QUEM_SOMOS_LINK.label}
          </a>
          <div
            className="relative"
            onMouseEnter={() => setRecursosOpen(true)}
            onMouseLeave={() => setRecursosOpen(false)}
          >
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-semibold text-graphite-700 transition-colors hover:text-navy-900"
              aria-expanded={recursosOpen}
            >
              Funcionalidades <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {recursosOpen && (
              <div className="absolute left-0 top-full w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-xl">
                {emHome && (
                  <a
                    href="#funcionalidades"
                    className="block px-4 py-2 text-sm font-medium text-graphite-700 hover:bg-graphite-50 hover:text-navy-900"
                    onClick={() => setRecursosOpen(false)}
                  >
                    Visão geral
                  </a>
                )}
                {RECURSOS_LINKS.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="block px-4 py-2 text-sm font-medium text-graphite-700 hover:bg-graphite-50 hover:text-navy-900"
                    onClick={() => setRecursosOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={emHome ? l.href : `/${l.href}`} className="text-sm font-semibold text-graphite-700 transition-colors hover:text-navy-900">
              {l.label}
            </a>
          ))}
          <Link to="/planos" className="text-sm font-semibold text-graphite-700 transition-colors hover:text-navy-900">
            Planos
          </Link>
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <Link to="/entrar" className="text-sm font-semibold text-graphite-700 transition-colors hover:text-navy-900">
            Entrar
          </Link>
          <a
            href={buildWhatsAppLink("Ola! Quero conhecer o RLP Maintenance CMMS.")}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Falar com a equipe
          </a>
        </div>

        <button
          type="button"
          className="text-graphite-700 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-4">
            <a
              href={emHome ? QUEM_SOMOS_LINK.href : `/${QUEM_SOMOS_LINK.href}`}
              className="text-sm font-semibold text-graphite-700"
              onClick={() => setOpen(false)}
            >
              {QUEM_SOMOS_LINK.label}
            </a>
            <span className="text-xs font-bold uppercase tracking-wider text-graphite-400">Funcionalidades</span>
            {RECURSOS_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="pl-2 text-sm font-semibold text-graphite-700" onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={emHome ? l.href : `/${l.href}`} className="text-sm font-semibold text-graphite-700" onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link to="/planos" className="text-sm font-semibold text-graphite-700" onClick={() => setOpen(false)}>
              Planos
            </Link>
            <Link to="/entrar" className="text-sm font-semibold text-graphite-700" onClick={() => setOpen(false)}>
              Entrar
            </Link>
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o RLP Maintenance CMMS.")}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md bg-navy-900 px-5 py-2.5 text-center text-sm font-semibold text-white"
            >
              Falar com a equipe
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
