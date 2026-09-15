import { Link } from "react-router-dom";
import { ArrowRight, ListChecks, Tag, BarChart3, Target, FileText, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: Tag,
    title: "Códigos de falha padronizados",
    description:
      "Um catálogo só, usado por todo mundo - sem cada técnico descrever a mesma quebra com palavras diferentes na hora de fechar a ordem.",
  },
  {
    icon: BarChart3,
    title: "Análise de Pareto",
    description:
      "Descubra os 20% de causas que respondem por 80% das quebras - onde investir manutenção fica óbvio, não é mais palpite.",
  },
  {
    icon: Target,
    title: "RCA - análise de causa raiz",
    description:
      "Falha crítica ou recorrente abre uma análise formal: causa, plano de ação e verificação de eficácia, até fechar de verdade.",
  },
  {
    icon: FileText,
    title: "Histórico por ativo",
    description:
      "Cada quebra fica registrada na ficha do ativo - decisões de troca, upgrade ou descarte se apoiam em dado, não em memória de quem já viu a máquina falhar antes.",
  },
];

export default function FailuresRca() {
  return (
    <div>
      <Seo
        title="Falhas e análise de causa raiz"
        description="Códigos de falha padronizados, Pareto de quebras e RCA para tratar a causa, não só o sintoma - módulo de falhas do CMMS RLP Maintenance."
        path="/falhas-e-causa-raiz"
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
              <ListChecks className="h-3.5 w-3.5" /> Falhas e causa raiz
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Pare de resolver o mesmo problema todo mês
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Códigos de falha padronizados, análise de Pareto e RCA - trate a causa, não só o sintoma que volta toda
              semana.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer a analise de falhas e RCA do RLP Maintenance CMMS.")}
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
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Pareto de falhas - 90 dias</p>
              <div className="space-y-2.5">
                {[
                  { causa: "Desalinhamento", pct: 38 },
                  { causa: "Falta de lubrificação", pct: 26 },
                  { causa: "Fadiga de material", pct: 14 },
                  { causa: "Contaminação", pct: 9 },
                ].map((c) => (
                  <div key={c.causa}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-navy-900">{c.causa}</span>
                      <span className="text-graphite-500">{c.pct}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-graphite-100">
                      <div className="h-2 rounded-full bg-brand-lime" style={{ width: `${c.pct * 2}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Da quebra registrada ao plano de ação verificado
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
          <ListChecks className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Descubra a causa raiz das suas quebras</h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o Pareto de falhas funcionando com o histórico da sua
            fábrica.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer a analise de falhas e RCA do RLP Maintenance CMMS.")}
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
