import { Link } from "react-router-dom";
import {
  ArrowRight,
  Droplets,
  MapPin,
  Route as RouteIcon,
  FlaskConical,
  TrendingUp,
  History,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: MapPin,
    title: "Ponto de lubrificação por ativo",
    description:
      "Cada mancal, redutor ou caixa de engrenagem vira um ponto: lubrificante certo, quantidade e frequência definidas uma vez, sem depender de quem já trabalha lá há mais tempo.",
  },
  {
    icon: RouteIcon,
    title: "Rota por área",
    description:
      "Agrupe pontos numa rota que o lubrificador percorre na fábrica - a ordem de aplicação sai pronta, sem precisar montar o roteiro na cabeça todo dia.",
  },
  {
    icon: FlaskConical,
    title: "Catálogo de lubrificantes",
    description:
      "Graxa, óleo ou lubrificante sólido, com estoque e custo ligados ao almoxarifado técnico - saiba quanto cada rota consome antes de faltar na prateleira.",
  },
  {
    icon: TrendingUp,
    title: "Previsão de consumo",
    description:
      "A partir da frequência de cada ponto, o sistema projeta o consumo do período - compra o que vai precisar, não o que sobrou da última vez.",
  },
  {
    icon: History,
    title: "Histórico de aplicações",
    description:
      "Toda aplicação registrada fica no histórico do ponto: quando foi, quanto foi usado e quem aplicou - a rastreabilidade que a planilha nunca teve.",
  },
];

export default function Lubrication() {
  return (
    <div>
      <Seo
        title="Lubrificação industrial"
        description="Pontos de lubrificação, rotas por área e previsão de consumo ligados ao almoxarifado - módulo de lubrificação do CMMS RLP Maintenance."
        path="/lubrificacao"
      />
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
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-lime">
              <Droplets className="h-3.5 w-3.5" /> Lubrificação
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              O lubrificante certo, no ativo certo, na hora certa
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Pontos de lubrificação, rotas por área e previsão de consumo num só lugar - sem depender de quem
              lembra qual mancal recebe qual graxa.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer o modulo de lubrificacao do RLP Maintenance CMMS.")}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-lime px-6 py-3.5 text-sm font-bold text-navy-950 transition-colors hover:bg-brand-lime-dark"
              >
                Falar com a equipe <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 rounded-md border border-white/25 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Ver o CMMS completo
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:mx-0">
            <div className="rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Rota de lubrificação</p>
                  <p className="font-bold text-navy-900">Área de extrusão - Turno manhã</p>
                </div>
                <span className="rounded-full bg-brand-lime/15 px-2.5 py-1 text-[11px] font-bold text-brand-lime-dark">6 pontos</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {[
                  { done: true, label: "Mancal LE-01 · Graxa lítio EP2" },
                  { done: true, label: "Redutor RD-04 · Óleo ISO 220" },
                  { done: false, label: "Mancal LE-02 · Graxa lítio EP2" },
                  { done: false, label: "Corrente CT-03 · Óleo penetrante" },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={
                        "h-4.5 w-4.5 shrink-0 rounded-full border-2 " +
                        (item.done ? "border-brand-lime-dark bg-brand-lime/20" : "border-graphite-300")
                      }
                    />
                    <span className={item.done ? "text-graphite-400 line-through" : "text-graphite-700"}>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-lg bg-graphite-50 px-3.5 py-3 text-xs">
                <span className="font-medium text-graphite-500">Consumo previsto no mês</span>
                <span className="font-semibold text-navy-900">4,2 kg graxa · 8 L óleo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Do cadastro do ponto à prateleira do almoxarifado
          </h2>
          <p className="mt-4 text-graphite-500">Cinco capacidades que tiram a lubrificação da planilha e da memória de quem executa.</p>
        </div>
        <div className="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {CAPACIDADES.map((c) => (
            <div key={c.title}>
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-navy-900">
                <c.icon className="h-5 w-5 text-brand-lime" />
              </span>
              <h3 className="mt-4 font-bold text-navy-900">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite-500">{c.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-navy-900 py-24">
        <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime">Almoxarifado ligado</span>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Sem lubrificante fora do controle de estoque
            </h2>
            <p className="mt-4 text-navy-200">
              Cada lubrificante do catálogo é também uma peça do almoxarifado técnico: toda aplicação registrada
              baixa o estoque e atualiza o custo, do mesmo jeito que uma peça trocada numa ordem de manutenção.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Estoque e custo compartilhados com o almoxarifado técnico",
                "Alerta de estoque baixo antes de faltar na prateleira",
                "Previsão de consumo por rota e por período",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-2xl">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Catálogo · Lubrificantes</p>
            <div className="space-y-2.5">
              {[
                { nome: "Graxa lítio EP2", saldo: "18,4 kg", status: "OK" },
                { nome: "Óleo ISO 220", saldo: "32 L", status: "OK" },
                { nome: "Óleo penetrante", saldo: "2,1 L", status: "Baixo" },
              ].map((l) => (
                <div key={l.nome} className="flex items-center justify-between rounded-lg bg-graphite-50 px-3.5 py-3 text-sm">
                  <span className="font-semibold text-navy-900">{l.nome}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-graphite-500">{l.saldo}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] font-bold " +
                        (l.status === "OK" ? "bg-brand-lime/15 text-brand-lime-dark" : "bg-red-100 text-red-700")
                      }
                    >
                      {l.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

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
          <Droplets className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Organize a lubrificação da sua fábrica
          </h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja pontos, rotas e previsão de consumo funcionando com o parque
            da sua empresa.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o modulo de lubrificacao do RLP Maintenance CMMS.")}
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
