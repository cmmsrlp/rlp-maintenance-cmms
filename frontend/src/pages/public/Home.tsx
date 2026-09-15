import { Link } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  ClipboardList,
  GitBranch,
  ShieldCheck,
  Radar,
  Droplets,
  Recycle,
  ListChecks,
  Users,
  CheckCircle2,
  TimerReset,
  Activity,
  Gauge,
  Wrench,
  FileSpreadsheet,
  MessageCircle,
  CircleCheck,
  Circle,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const FEATURES = [
  {
    icon: GitBranch,
    title: "Árvore de ativos",
    description: "Plantas, áreas e máquinas com estrutura pai/filho - cada componente é um ativo completo, com ficha técnica própria.",
    to: "/gestao-de-ativos",
  },
  {
    icon: Radar,
    title: "Manutenção preditiva",
    description: "Medidores de condição com zonas de severidade disparam ordens automaticamente antes da quebra acontecer.",
    to: "/manutencao-preditiva",
  },
  {
    icon: Boxes,
    title: "Almoxarifado técnico",
    description: "Peças por empresa, lista de materiais por ativo (BOM), reserva automática e alerta de estoque baixo.",
    to: "/almoxarifado-tecnico",
  },
  {
    icon: Droplets,
    title: "Lubrificação",
    description: "Pontos de lubrificação, rotas por área e previsão de consumo - o lubrificante certo, no ativo certo.",
    to: "/lubrificacao",
  },
  {
    icon: Recycle,
    title: "Equipamentos recondicionáveis",
    description: "Motor, redutor, bomba ou rolo - rastreados entre estoque, instalação e reparo, com orçamento e nota fiscal de retorno.",
    to: "/equipamentos-recondicionaveis",
  },
  {
    icon: ListChecks,
    title: "Falhas e causa raiz",
    description: "Códigos de falha padronizados, análise de Pareto e RCA para parar de resolver o mesmo problema todo mês.",
    to: "/falhas-e-causa-raiz",
  },
  {
    icon: Users,
    title: "Portal do cliente",
    description: "Cada empresa acessa só o próprio parque, com perfis por função: administrador, planejador, técnico e solicitante.",
    to: "/portal-do-cliente",
  },
];

const PASSOS = [
  { numero: "01", titulo: "Cadastre o parque", descricao: "Ativos, plantas, áreas e centros de custo - a estrutura real da sua fábrica." },
  { numero: "02", titulo: "Monte os planos", descricao: "Defina a periodicidade e vincule a um ou vários ativos de uma vez." },
  { numero: "03", titulo: "Deixe rodar sozinho", descricao: "A ordem de serviço nasce na hora certa, direto para quem vai executar." },
  { numero: "04", titulo: "Acompanhe os números", descricao: "MTTR, MTBF, disponibilidade e cumprimento do plano, calculados sozinhos." },
];

const PILARES_RLP = [
  {
    letra: "R",
    icon: ShieldCheck,
    titulo: "Reliability",
    subtitulo: "Confiabilidade",
    descricao: "Planos preventivos, checklists e histórico de falhas para que o ativo pare de quebrar por surpresa.",
  },
  {
    letra: "L",
    icon: RefreshCw,
    titulo: "Lifecycle",
    subtitulo: "Ciclo de vida",
    descricao: "Do cadastro do ativo à baixa, com todo o histórico de manutenção, custo e condição num só lugar.",
  },
  {
    letra: "P",
    icon: TrendingUp,
    titulo: "Performance",
    subtitulo: "Performance",
    descricao: "MTTR, MTBF e disponibilidade calculados sozinhos, para decidir com número e não com achismo.",
  },
];

const INDICADORES = [
  { icon: TimerReset, label: "MTTR", valor: "2,4h", descricao: "Tempo médio para reparar uma falha" },
  { icon: Activity, label: "MTBF", valor: "312h", descricao: "Tempo médio entre falhas do mesmo ativo" },
  { icon: Gauge, label: "Disponibilidade", valor: "96%", descricao: "Quanto tempo o ativo ficou operando" },
  { icon: Wrench, label: "Cumprimento do plano", valor: "91%", descricao: "Ordens preventivas que saíram no prazo" },
];

export default function Home() {
  return (
    <div>
      <Seo
        title="RLP Maintenance CMMS - Sistema de Gestão da Manutenção"
        description="CMMS para manutenção industrial: ativos, planos preventivos, ordens de serviço, almoxarifado, lubrificação e indicadores num só lugar."
        path="/"
      />
      {/* Hero - faixa navy cheia de largura, com textura de grade sutil */}
      <section className="relative overflow-hidden bg-navy-900">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <h1 className="text-[2.75rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
              Manutenção industrial, organizada de ponta a ponta
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Ativos, planos preventivos, ordens de serviço e almoxarifado num só lugar. Aumente a disponibilidade
              dos seus equipamentos e tire a manutenção da planilha e do WhatsApp.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer o RLP Maintenance CMMS.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-lime px-6 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-brand-lime-dark"
              >
                Falar com a equipe <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#funcionalidades"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Ver funcionalidades
              </a>
            </div>
          </div>

          {/* Mockup ilustrativo de uma ordem de manutencao - representacao, nao print exato da tela */}
          <div className="relative mx-auto w-full max-w-md lg:mx-0">
            <div className="rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Ordem de manutenção</p>
                  <p className="font-bold text-navy-900">OS-482 · Troca de rolamento</p>
                </div>
                <span className="rounded-full bg-brand-lime/15 px-2.5 py-1 text-[11px] font-bold text-brand-lime-dark">Em execução</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { done: true, label: "Bloquear e sinalizar o equipamento" },
                  { done: true, label: "Remover proteção do mancal" },
                  { done: false, label: "Substituir rolamento e lubrificar" },
                  { done: false, label: "Testar em vazio por 10 minutos" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-sm">
                    {item.done ? (
                      <CircleCheck className="h-4.5 w-4.5 shrink-0 text-brand-lime-dark" />
                    ) : (
                      <Circle className="h-4.5 w-4.5 shrink-0 text-graphite-300" />
                    )}
                    <span className={item.done ? "text-graphite-400 line-through" : "text-graphite-700"}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-graphite-50 px-3.5 py-3 text-xs">
                <span className="font-medium text-graphite-500">Responsável</span>
                <span className="font-semibold text-navy-900">Equipe de Manutenção</span>
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden rounded-lg bg-white px-4 py-3 shadow-xl sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Disponibilidade</p>
              <p className="text-xl font-extrabold text-navy-900">96%</p>
            </div>
          </div>
        </div>
      </section>

      {/* Dor / proposta */}
      <section className="py-14">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xl font-medium leading-relaxed text-graphite-700">
            Planilha desatualiza, WhatsApp perde histórico e ninguém sabe se a preventiva do mês saiu.{" "}
            <span className="font-semibold text-navy-900">O CMMS resolve isso automaticamente.</span>
          </p>
        </div>
      </section>

      {/* Quem somos */}
      <section id="quem-somos" className="border-t border-gray-100 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Quem somos</span>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-navy-900 sm:text-4xl">
                Um CMMS feito para quem vive a manutenção industrial
              </h2>
              <p className="mt-5 leading-relaxed text-graphite-600">
                A RLP Maintenance nasceu para tirar a manutenção da planilha solta e do grupo de WhatsApp. Construímos
                um sistema único para cadastrar o parque de ativos, planejar a preventiva, programar as ordens de
                serviço e acompanhar o almoxarifado - com os indicadores que a fábrica realmente usa para decidir onde
                investir.
              </p>
              <p className="mt-4 leading-relaxed text-graphite-600">
                O nome carrega o compromisso do produto: <span className="font-semibold text-navy-900">RLP</span> vem de{" "}
                <span className="font-semibold text-navy-900">Reliability, Lifecycle &amp; Performance</span> -
                Confiabilidade, Ciclo de Vida e Performance, em português. É o que guia cada tela do sistema.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              {PILARES_RLP.map((p) => (
                <div key={p.letra} className="rounded-xl border border-gray-200 bg-white p-6 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-lg font-extrabold text-brand-lime">
                      {p.letra}
                    </span>
                    <p.icon className="h-5 w-5 text-navy-700" />
                  </div>
                  <h3 className="mt-4 font-bold text-navy-900">{p.titulo}</h3>
                  <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">{p.subtitulo}</p>
                  <p className="mt-2.5 text-sm leading-relaxed text-graphite-500">{p.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Faixa navy - plano preventivo */}
      <section className="bg-navy-900 py-24">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div className="order-2 lg:order-1">
            <div className="rounded-xl bg-white p-5 shadow-2xl">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Plano preventivo · PM-0032</p>
              <p className="font-bold text-navy-900">Inspeção mensal - Compressor de ar</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-graphite-50 p-3">
                  <p className="text-[11px] font-medium text-graphite-500">Periodicidade</p>
                  <p className="text-sm font-bold text-navy-900">A cada 30 dias</p>
                </div>
                <div className="rounded-lg bg-graphite-50 p-3">
                  <p className="text-[11px] font-medium text-graphite-500">Próximo vencimento</p>
                  <p className="text-sm font-bold text-navy-900">12/10/2026</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-brand-lime/10 px-3.5 py-3 text-xs font-semibold text-brand-lime-dark">
                <ShieldCheck className="h-4 w-4 shrink-0" /> Ordem gerada automaticamente no vencimento
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime">Planos preventivos</span>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              A ordem de serviço nasce sozinha, na hora certa
            </h2>
            <p className="mt-4 text-navy-200">
              Monte o plano por tempo ou por leitura de medidor, atribua a um ou vários ativos de uma vez, e deixe o
              sistema disparar a ordem quando vencer - sem ninguém precisar lembrar.
            </p>
            <ul className="mt-6 space-y-3">
              {["Por tempo ou por medidor (uso/condição)", "Um plano cobre vários ativos", "Checklist e materiais já anexados na ordem"].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime" /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section id="funcionalidades" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Funcionalidades</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Tudo que a sua manutenção precisa</h2>
          <p className="mt-4 text-graphite-500">Um sistema só, do cadastro do ativo até o relatório de indicador.</p>
        </div>
        <div className="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-900">
                <f.icon className="h-5 w-5 text-brand-lime" />
              </span>
              <h3 className="mt-4 font-bold text-navy-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite-500">{f.description}</p>
              {f.to && (
                <Link
                  to={f.to}
                  className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-900 transition-colors hover:text-brand-lime-dark"
                >
                  Saiba mais <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="border-t border-gray-100 bg-graphite-50/60 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Quatro passos, sem complicação</h2>
          </div>
          <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {PASSOS.map((p) => (
              <div key={p.numero} className="border-t-2 border-navy-900/10 pt-5">
                <span className="text-4xl font-extrabold text-navy-900/15">{p.numero}</span>
                <h3 className="mt-3 font-bold text-navy-900">{p.titulo}</h3>
                <p className="mt-2 text-sm leading-relaxed text-graphite-500">{p.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Indicadores */}
      <section id="indicadores" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Indicadores</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Os números que a sua fábrica precisa</h2>
            <p className="mt-4 text-graphite-500">
              MTTR, MTBF, disponibilidade e cumprimento de plano são calculados sozinhos, a partir das ordens que a
              sua equipe já executa no dia a dia.
            </p>
            <ul className="mt-7 space-y-3.5">
              {["Calculado automaticamente a cada ordem concluída", "Filtro por cliente, ativo e período", "Base para decidir onde investir manutenção"].map(
                (item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-graphite-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime-dark" /> {item}
                  </li>
                ),
              )}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {INDICADORES.map((k) => (
              <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
                <k.icon className="h-5 w-5 text-navy-700" />
                <p className="mt-3 text-2xl font-extrabold text-navy-900">{k.valor}</p>
                <p className="text-sm font-semibold text-navy-900">{k.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-graphite-500">{k.descricao}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Importacao de dados */}
      <section className="border-t border-gray-100 bg-graphite-50/60 py-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-5 px-4 text-center sm:px-6 lg:px-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-navy-900">
            <FileSpreadsheet className="h-7 w-7 text-brand-lime" />
          </span>
          <h2 className="text-2xl font-extrabold text-navy-900">Já tem uma planilha de ativos? Importe de uma vez.</h2>
          <p className="max-w-2xl text-graphite-500">
            Baixe o modelo do CMMS, copie os dados do seu parque atual pra ele e suba de uma vez - o sistema confere
            tudo antes de gravar, sem precisar digitar ativo por ativo de novo.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="relative overflow-hidden bg-navy-900 py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8">
          <ClipboardList className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Pronto para organizar a manutenção da sua fábrica?
          </h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o CMMS funcionando com o parque da sua empresa.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o RLP Maintenance CMMS.")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-lime px-6 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-brand-lime-dark"
            >
              <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
            </a>
            <Link
              to="/entrar"
              className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              Já sou cliente - Entrar
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
