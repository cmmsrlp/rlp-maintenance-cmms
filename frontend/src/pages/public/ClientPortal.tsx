import { Link } from "react-router-dom";
import { ArrowRight, Users, ShieldCheck, Smartphone, MessageSquare, KeyRound, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const PERFIS = [
  { nome: "Administrador", descricao: "Gerencia contrato, usuários e todos os cadastros da empresa." },
  { nome: "Planejador", descricao: "Monta planos, programa e aprova ordens - sem mexer em contrato ou limites." },
  { nome: "Técnico", descricao: "Executa o que foi programado, registra o apontamento em campo." },
  { nome: "Solicitante", descricao: "Abre e acompanha as próprias solicitações de serviço, sem mais nada além disso." },
];

const CAPACIDADES = [
  {
    icon: ShieldCheck,
    title: "Cada empresa vê só o próprio parque",
    description:
      "Ativos, ordens e indicadores isolados por cliente - nenhuma empresa enxerga um dado que não é dela.",
  },
  {
    icon: KeyRound,
    title: "Quatro perfis, cada um com seu limite",
    description:
      "De quem administra o contrato até quem só abre uma solicitação - o acesso é do tamanho do que a pessoa precisa fazer.",
  },
  {
    icon: MessageSquare,
    title: "Solicitação de serviço sem sistema complicado",
    description:
      "O Solicitante abre um pedido em segundos, sem precisar entender ativo, plano ou ordem - vira uma solicitação de verdade na triagem.",
  },
  {
    icon: Smartphone,
    title: "Acesso de qualquer lugar",
    description:
      "Painel responsivo - o técnico apontando a ordem no chão de fábrica, o gestor acompanhando o indicador do escritório.",
  },
];

export default function ClientPortal() {
  return (
    <div>
      <Seo
        title="Portal do cliente"
        description="Cada empresa no próprio painel, cada pessoa no seu perfil - administrador, planejador, técnico e solicitante no CMMS RLP Maintenance."
        path="/portal-do-cliente"
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
              <Users className="h-3.5 w-3.5" /> Portal do cliente
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Cada empresa no próprio painel, cada pessoa no seu perfil
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Administrador, planejador, técnico e solicitante - todo mundo acessa só o que precisa, sem senha
              compartilhada nem planilha circulando por e-mail.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer o portal do cliente do RLP Maintenance CMMS.")}
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
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Acessos da empresa</p>
              <div className="space-y-2.5">
                {PERFIS.map((p) => (
                  <div key={p.nome} className="flex items-center justify-between rounded-lg bg-graphite-50 px-3.5 py-3 text-sm">
                    <span className="font-semibold text-navy-900">{p.nome}</span>
                    <span className="text-xs text-graphite-500">Ativo</span>
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
            O acesso certo, para cada função da equipe
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

      <section className="bg-navy-900 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime">Perfis</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Quatro papéis, sem confusão de acesso</h2>
          </div>
          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PERFIS.map((p) => (
              <div key={p.nome} className="rounded-xl border border-white/10 bg-white/5 p-5">
                <h3 className="font-bold text-white">{p.nome}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-200">{p.descricao}</p>
              </div>
            ))}
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
          <Users className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Dê a cada pessoa o acesso certo</h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o portal funcionando com os perfis da sua equipe.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o portal do cliente do RLP Maintenance CMMS.")}
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
