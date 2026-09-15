import { Link } from "react-router-dom";
import { ArrowRight, Boxes, PackageSearch, ClipboardList, Bell, DollarSign, MessageCircle } from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: PackageSearch,
    title: "Estoque por empresa",
    description:
      "Cada cliente tem o próprio almoxarifado técnico - peças, quantidades e localização separadas, sem misturar o estoque de fábricas diferentes.",
  },
  {
    icon: ClipboardList,
    title: "Lista de materiais por ativo (BOM)",
    description:
      "Vincule as peças que um ativo usa - na hora de abrir a ordem, o técnico já sabe o que precisa separar antes de ir até a máquina.",
  },
  {
    icon: Bell,
    title: "Reserva automática e alerta de estoque baixo",
    description:
      "A ordem reserva o material assim que é gerada, e o sistema avisa antes de faltar peça na prateleira - sem surpresa no meio do serviço.",
  },
  {
    icon: DollarSign,
    title: "Custo por ordem",
    description:
      "Peças + mão de obra somadas automaticamente em cada ordem - saiba quanto cada ativo já custou, não só quanto ele custou pra comprar.",
  },
];

export default function TechnicalWarehouse() {
  return (
    <div>
      <Seo
        title="Almoxarifado técnico"
        description="Estoque técnico por empresa, lista de materiais por ativo (BOM), reserva automática e alerta de estoque baixo - almoxarifado do CMMS RLP Maintenance."
        path="/almoxarifado-tecnico"
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
              <Boxes className="h-3.5 w-3.5" /> Almoxarifado técnico
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              A peça certa, reservada antes de faltar
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Estoque técnico por empresa, lista de materiais por ativo e reserva automática na ordem - sem ninguém
              descobrir que faltou peça só na hora de trocar.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer o almoxarifado tecnico do RLP Maintenance CMMS.")}
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
            <div className="overflow-hidden rounded-xl bg-white shadow-2xl">
              <img
                src="/screenshots/almoxarifado.png"
                alt="Tela de almoxarifado técnico do RLP Maintenance CMMS"
                className="block h-[300px] w-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Do cadastro da peça ao custo da ordem
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
          <Boxes className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Organize o almoxarifado técnico da sua fábrica</h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o estoque técnico funcionando ligado às suas ordens de
            manutenção.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o almoxarifado tecnico do RLP Maintenance CMMS.")}
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
