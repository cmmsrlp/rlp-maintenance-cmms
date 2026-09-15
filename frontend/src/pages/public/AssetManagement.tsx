import { Link } from "react-router-dom";
import {
  ArrowRight,
  GitBranch,
  MapPin,
  Tags,
  ShieldAlert,
  FileSpreadsheet,
  Camera,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: GitBranch,
    title: "Árvore de ativos",
    description:
      "Planta, área, máquina, subconjunto e parte - cada nível é um ativo completo, com ficha técnica, calibração e ordens próprias, não uma linha solta numa planilha.",
  },
  {
    icon: MapPin,
    title: "Localização estruturada",
    description:
      "Planta, área, sistema e centro de custo cadastrados uma vez e herdados pelos ativos filhos - filtre \"tudo da Área 2\" sem percorrer a árvore inteira.",
  },
  {
    icon: Tags,
    title: "Catálogo de tipos",
    description:
      "Motor, compressor, redutor, extrusora - cada tipo com seus próprios campos técnicos (potência, rotação, capacidade), sem forçar todo ativo no mesmo formulário genérico.",
  },
  {
    icon: ShieldAlert,
    title: "Criticidade e status operacional",
    description:
      "Marque o quanto uma parada deste ativo pesa pra fábrica e se ele está rodando, parado ou em manutenção - a prioridade da ordem já nasce coerente com o que o ativo vale.",
  },
  {
    icon: Camera,
    title: "Foto e anexos",
    description:
      "Foto do equipamento, manual, desenho técnico ou laudo - cada ativo carrega o próprio histórico documental, acessível de qualquer tela que o referencia.",
  },
  {
    icon: FileSpreadsheet,
    title: "Importação em massa",
    description:
      "Já tem o parque numa planilha? Suba o arquivo e comece a usar sem precisar recadastrar ativo por ativo.",
  },
];

export default function AssetManagement() {
  return (
    <div>
      <Seo
        title="Gestão de ativos industriais"
        description="Árvore de ativos com estrutura pai/filho, ficha técnica por tipo, criticidade e localização herdada - a base do CMMS RLP Maintenance."
        path="/gestao-de-ativos"
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
              <GitBranch className="h-3.5 w-3.5" /> Gestão de ativos
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              O parque completo da fábrica, organizado numa árvore só
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Planta, área, máquina e componente com estrutura pai/filho, ficha técnica por tipo e localização
              herdada - o cadastro que vira base de todo o resto do CMMS.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer a gestao de ativos do RLP Maintenance CMMS.")}
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
                src="/screenshots/arvore-de-ativos.png"
                alt="Tela de árvore de ativos do RLP Maintenance CMMS"
                className="block h-[220px] w-full object-cover object-top"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Um cadastro que sustenta o resto do CMMS
          </h2>
          <p className="mt-4 text-graphite-500">
            Seis capacidades para o ativo deixar de ser uma linha de planilha e virar a base de planos, ordens e
            indicadores.
          </p>
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
          <div className="order-2 lg:order-1">
            <div className="overflow-hidden rounded-xl bg-white shadow-2xl">
              <img
                src="/screenshots/ficha-tecnica.png"
                alt="Ficha técnica de um ativo no RLP Maintenance CMMS"
                className="block h-[300px] w-full object-cover object-top"
              />
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime">Ficha técnica por tipo</span>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Campos que fazem sentido pra cada tipo de ativo
            </h2>
            <p className="mt-4 text-navy-200">
              Motor pede potência e rotação, redutor pede relação de redução, tanque pede volume - o formulário
              muda com o tipo escolhido, sem obrigar todo ativo a preencher os mesmos campos genéricos.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Catálogo de tipos aberto - crie os seus além dos padrão",
                "Criticidade e status operacional em cada ativo",
                "Localização (planta/área/sistema) herdada na árvore",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime" /> {item}
                </li>
              ))}
            </ul>
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
          <GitBranch className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Coloque o parque da sua fábrica numa árvore só
          </h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o cadastro de ativos funcionando com a estrutura real da sua
            empresa.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer a gestao de ativos do RLP Maintenance CMMS.")}
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
