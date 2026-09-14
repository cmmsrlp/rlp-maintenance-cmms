import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Gauge,
  ClipboardList,
  ClipboardPlus,
  User,
  Wrench,
  ShieldCheck,
  Boxes,
  CalendarDays,
  ListChecks,
  BarChart3,
  SlidersHorizontal,
  Radar,
  Droplets,
  MapPin,
  Route,
  FlaskConical,
  TrendingUp,
  History,
  ReceiptText,
  HardHat,
  Droplet,
  LayoutGrid,
  Settings,
  FileSpreadsheet,
  Sparkles,
  FileSearch,
  RefreshCw,
  CalendarRange,
} from "lucide-react";
import type { Role, ServiceCategory } from "../api/types";

export interface PortalNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Servicos que liberam este item; omitido = sempre visivel (dashboard, pedidos, perfil). */
  requires?: ServiceCategory[];
  /** So marca como ativo na rota exata - usado nos itens que sao "pai" de sub-rotas. */
  exact?: boolean;
  /** So aparece para quem NAO contratou o CMMS - usado no painel inicial, que muda de
   * dono conforme o que a empresa tem. */
  semCmms?: boolean;
  /** Perfis que veem o item. Omitido = toda a equipe de manutencao (nao o Solicitante,
   * que tem menu proprio). O menu acompanha as rotas: item que leva a uma tela bloqueada
   * so faz a pessoa bater na porta fechada. */
  perfis?: Role[];
}

export interface PortalNavSection {
  /** Titulo do grupo; vazio no primeiro bloco, que nao precisa de rotulo. */
  title?: string;
  /** Icone do grupo - o cabecalho tem o mesmo peso visual dos itens, entao precisa de um
   * icone tambem: sem ele a linha do titulo ficava desalinhada das de baixo. */
  icon?: LucideIcon;
  items: PortalNavItem[];
  /** Comeca recolhida. Serve para o que nao se usa todo dia nao competir com o que se usa. */
  defaultCollapsed?: boolean;
}

/**
 * O menu segue o dia a dia de quem opera a manutencao: primeiro o que se usa toda hora,
 * depois analise, e por ultimo os cadastros (que se configura uma vez). Catalogo nenhum
 * ganha item proprio no menu - todos ficam dentro de "Gestao".
 */
const PORTAL_NAV_SECTIONS: PortalNavSection[] = [
  {
    // Uma casa so: para quem tem o CMMS (todo cliente deste produto), o painel do CMMS
    // E' a pagina inicial.
    items: [
      { to: "/portal/manutencao", label: "Painel do CMMS", icon: Wrench, requires: ["CMMS_MAINTENANCE"], exact: true },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/insights", label: "Insights", icon: Sparkles, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal", label: "Dashboard", icon: LayoutDashboard, semCmms: true },
    ],
  },
  {
    // O dia a dia: o que se abre, programa e executa. Separado da "Gestao" (o parque, o
    // estoque, o acompanhamento de condicao) porque sao rotinas de pessoas diferentes -
    // e porque um unico bloco de nove itens ja nao era um menu, era uma lista.
    title: "Operacional",
    icon: HardHat,
    items: [
      { to: "/portal/manutencao/solicitacoes", label: "Solicitacoes", icon: ClipboardPlus, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/manutencao/ordens", label: "Ordens de manutencao", icon: ClipboardList, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/programacao", label: "Programacao", icon: CalendarDays, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/planejamento", label: "Planejamento", icon: ListChecks, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/cronogramas-parada", label: "Cronogramas de parada", icon: CalendarRange, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/planos", label: "Planos preventivos", icon: ShieldCheck, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/preditiva", label: "Preditiva", icon: Radar, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/analise-laudos", label: "Analise de laudos", icon: FileSearch, requires: ["CMMS_MAINTENANCE"] },
    ],
  },
  {
    // Lubrificacao tem topico proprio: e' um ciclo inteiro (lubrificante no almoxarifado ->
    // ponto -> rota -> aplicacao -> previsao de consumo), com rotina e responsavel proprios,
    // e nao um item solto dentro de manutencao.
    title: "Lubrificacao",
    icon: Droplet,
    defaultCollapsed: true,
    items: [
      { to: "/portal/lubrificacao", label: "Painel", icon: Droplets, requires: ["CMMS_MAINTENANCE"], exact: true },
      { to: "/portal/lubrificacao/pontos", label: "Pontos", icon: MapPin, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/lubrificacao/rotas", label: "Rotas", icon: Route, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/lubrificacao/lubrificantes", label: "Lubrificantes", icon: FlaskConical, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/lubrificacao/previsao", label: "Previsao de consumo", icon: TrendingUp, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/lubrificacao/historico", label: "Historico", icon: History, requires: ["CMMS_MAINTENANCE"] },
    ],
  },
  {
    title: "Gestao",
    icon: LayoutGrid,
    defaultCollapsed: true,
    items: [
      // Antes dos ativos de proposito: planta, area, centro de custo, tipo de ativo e as
      // funcoes da equipe precisam existir para o primeiro ativo ser cadastrado inteiro.
      // Ficava em "Configuracao", no rodape, como se fosse ajuste raro - e quem chegava
      // para cadastrar o parque so descobria os catalogos depois de tropecar neles.
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/ativos/cadastros", label: "Cadastros tecnicos", icon: SlidersHorizontal, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/ativos", label: "Meus ativos", icon: Gauge, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/manutencao/equipamentos-recondicionaveis", label: "Equipamentos recondicionaveis", icon: RefreshCw, requires: ["CMMS_MAINTENANCE"] },
      { to: "/portal/almoxarifado", label: "Almoxarifado", icon: Boxes, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT", "CLIENT_PLANNER"], to: "/portal/manutencao/pareto", label: "Falhas e RCA", icon: BarChart3, requires: ["CMMS_MAINTENANCE"] },
    ],
  },
  {
    title: "Configuracao",
    icon: Settings,
    items: [
      { perfis: ["CLIENT"], to: "/portal/manutencao/importar", label: "Importar dados", icon: FileSpreadsheet, requires: ["CMMS_MAINTENANCE"] },
      { perfis: ["CLIENT"], to: "/portal/contrato", label: "Meu contrato", icon: ReceiptText },
      { to: "/portal/perfil", label: "Meu perfil", icon: User },
    ],
  },
];

/** Filtra o menu do portal pelas areas de servico que o cliente contratou, descartando
 * secoes que ficaram vazias depois do filtro. */
/** O Solicitante ve um menu de duas linhas: abrir solicitacao e o proprio perfil. Mostrar
 * o resto desabilitado so criaria a impressao de que ele deveria ter acesso. */
const NAV_DO_SOLICITANTE: PortalNavSection[] = [
  {
    items: [
      { to: "/portal/manutencao/solicitacoes", label: "Minhas solicitacoes", icon: ClipboardPlus },
      { to: "/portal/perfil", label: "Meu perfil", icon: User },
    ],
  },
];

export function getPortalNav(contractedServices: ServiceCategory[], role?: string): PortalNavSection[] {
  if (role === "REQUESTER") return NAV_DO_SOLICITANTE;

  return PORTAL_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        (!item.requires || item.requires.some((c) => contractedServices.includes(c))) &&
        (!item.semCmms || !contractedServices.includes("CMMS_MAINTENANCE")) &&
        // O ADMIN da RLP Maintenance entra por acesso master de suporte: ve tudo.
        (!item.perfis || !role || role === "ADMIN" || item.perfis.includes(role as Role)),
    ),
  })).filter((section) => section.items.length > 0);
}

/** Secoes que comecam recolhidas na primeira visita - o que nao se usa todo dia nao precisa
 * competir por espaco com o que se usa. Depois vale a escolha do proprio usuario. */
export const PORTAL_NAV_PADRAO_FECHADO: string[] = PORTAL_NAV_SECTIONS.filter((s) => s.defaultCollapsed && s.title).map(
  (s) => s.title as string,
);
