import { Link } from "react-router-dom";
import { ArrowRight, Radar, Gauge, TrendingUp, AlertTriangle, Repeat, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: Gauge,
    title: "Medidor por ativo",
    description:
      "Horímetro, vibração, temperatura ou qualquer leitura de condição - cadastre o medidor uma vez e ele passa a alimentar planos e alarmes sozinho.",
  },
  {
    icon: AlertTriangle,
    title: "Zonas de severidade",
    description:
      "Normal, alerta, alarme e crítico, na linha da ISO 10816/20816 - cada zona dispara uma ação diferente, não só um número vermelho na tela.",
  },
  {
    icon: Repeat,
    title: "Gatilho por uso ou condição",
    description:
      "Plano por horímetro (troca a cada 500h) ou por leitura de condição (vibração entrou em alarme) - a ordem nasce do que o ativo realmente está fazendo.",
  },
  {
    icon: TrendingUp,
    title: "Tendência ao longo do tempo",
    description:
      "Histórico de leituras por medidor mostra a curva de degradação - decida a intervenção antes da quebra, não depois dela.",
  },
];

export default function PredictiveMaintenance() {
  return (
    <div>
      <Seo
        title="Manutenção preditiva industrial"
        description="Medidores de condição com zonas de severidade disparam ordens automaticamente antes da quebra - manutenção preditiva no CMMS RLP Maintenance."
        path="/manutencao-preditiva"
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
              <Radar className="h-3.5 w-3.5" /> Manutenção preditiva
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Intervenha antes da quebra acontecer
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Medidores de condição com zonas de severidade disparam ordens automaticamente - a manutenção deixa de
              reagir e passa a antecipar.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer a manutencao preditiva do RLP Maintenance CMMS.")}
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
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Medidor · Vibração mancal LE-01</p>
              <div className="flex items-end gap-1.5">
                {[30, 38, 34, 46, 52, 61, 74, 88].map((v, i) => (
                  <div key={i} className="flex-1 rounded-t bg-navy-900/10" style={{ height: `${v}px` }}>
                    <div
                      className={"h-full w-full rounded-t " + (v > 70 ? "bg-red-400" : v > 50 ? "bg-amber-400" : "bg-brand-lime")}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-3.5 py-3 text-xs font-semibold text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" /> Zona de alarme - ordem gerada automaticamente
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Do medidor à ordem de serviço, sem ninguém olhar o gráfico todo dia
          </h2>
        </div>
        <div className="mt-16 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
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
          <Radar className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Pare de esperar a máquina quebrar</h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja a manutenção preditiva funcionando com os ativos críticos da
            sua fábrica.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer a manutencao preditiva do RLP Maintenance CMMS.")}
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
