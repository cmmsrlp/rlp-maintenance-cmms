import { Link } from "react-router-dom";
import { ArrowRight, Check, MessageCircle, HelpCircle } from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";

const PLANOS = [
  {
    nome: "Starter",
    resumo: "Para começar a organizar um parque pequeno.",
    preco: "R$ 890",
    destaque: false,
    itens: [
      "Até 5 usuários",
      "Até 150 ativos",
      "Planos preventivos e ordens de serviço",
      "Portal do cliente",
      "Suporte por WhatsApp",
    ],
  },
  {
    nome: "Profissional",
    resumo: "Para quem já lubrifica, controla estoque e mede indicador.",
    preco: "R$ 2.990",
    destaque: true,
    itens: [
      "Até 20 usuários",
      "Até 800 ativos",
      "Tudo do Starter",
      "Lubrificação e almoxarifado técnico",
      "Manutenção preditiva e análise de falhas",
      "Indicadores (MTTR, MTBF, disponibilidade)",
    ],
  },
  {
    nome: "Enterprise",
    resumo: "Para operações grandes, com várias plantas e times.",
    preco: "Sob consulta",
    destaque: false,
    itens: [
      "Usuários e ativos sob medida",
      "Tudo do Profissional",
      "Múltiplas plantas e centros de custo",
      "Importação de dados assistida",
      "Suporte prioritário",
    ],
  },
];

const PERGUNTAS = [
  {
    pergunta: "O Solicitante (quem só abre uma solicitação) conta como usuário?",
    resposta: "Não. O perfil Solicitante é ilimitado em todos os planos - cobrar por quem só avisa que a máquina está ruim afastaria justamente quem precisa reportar o problema.",
  },
  {
    pergunta: "Dá pra mudar de plano depois?",
    resposta: "Sim, a qualquer momento. O limite de usuários e ativos é reavaliado na hora, sem precisar recadastrar nada.",
  },
  {
    pergunta: "Preciso recadastrar o parque que já tenho numa planilha?",
    resposta: "Não do zero. Você baixa o modelo de planilha do CMMS, copia os dados que já tem pra ele e sobe de uma vez só - o sistema confere tudo antes de gravar, então dá pra corrigir antes de qualquer coisa entrar.",
  },
];

export default function Pricing() {
  return (
    <div>
      <section className="relative overflow-hidden bg-navy-900">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
          <h1 className="text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
            Um plano para cada tamanho de fábrica
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-navy-200">
            Sem integração de cobrança escondida, sem letra miúda - fale com a equipe e a gente monta o plano certo
            para o seu parque.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-3">
          {PLANOS.map((p) => (
            <div
              key={p.nome}
              className={
                "relative flex flex-col rounded-2xl border p-8 " +
                (p.destaque ? "border-navy-900 bg-navy-900 shadow-2xl" : "border-gray-200 bg-white shadow-card")
              }
            >
              {p.destaque && (
                <span className="absolute -top-3 left-8 rounded-full bg-brand-lime px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-navy-950">
                  Mais escolhido
                </span>
              )}
              <h3 className={"text-xl font-extrabold " + (p.destaque ? "text-white" : "text-navy-900")}>{p.nome}</h3>
              <p className={"mt-2 text-sm " + (p.destaque ? "text-navy-200" : "text-graphite-500")}>{p.resumo}</p>
              <ul className="mt-6 flex-1 space-y-3">
                {p.itens.map((item) => (
                  <li key={item} className={"flex items-start gap-2.5 text-sm " + (p.destaque ? "text-navy-100" : "text-graphite-700")}>
                    <Check className={"mt-0.5 h-4 w-4 shrink-0 " + (p.destaque ? "text-brand-lime" : "text-brand-lime-dark")} />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={buildWhatsAppLink(`Ola! Quero saber mais sobre o plano ${p.nome} do RLP Maintenance CMMS.`)}
                target="_blank"
                rel="noopener noreferrer"
                className={
                  "mt-8 inline-flex items-center justify-center gap-1.5 rounded-md px-5 py-3 text-sm font-bold transition-colors " +
                  (p.destaque
                    ? "bg-brand-lime text-navy-950 hover:bg-brand-lime-dark"
                    : "bg-navy-900 text-white hover:bg-navy-800")
                }
              >
                Falar com a equipe <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-graphite-500">
          Os limites de usuário e ativo acima são referência - o valor exato do seu plano é calculado a partir do
          tamanho real do seu parque.
        </p>
      </section>

      <section className="border-t border-gray-100 bg-graphite-50/60 py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Dúvidas</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">Perguntas frequentes</h2>
          </div>
          <div className="mt-14 space-y-8">
            {PERGUNTAS.map((f) => (
              <div key={f.pergunta} className="flex gap-4">
                <HelpCircle className="mt-1 h-5 w-5 shrink-0 text-brand-lime-dark" />
                <div>
                  <h3 className="font-bold text-navy-900">{f.pergunta}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-graphite-500">{f.resposta}</p>
                </div>
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
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ainda com dúvida sobre qual plano escolher?</h2>
          <p className="max-w-xl text-navy-300">A equipe da RLP Maintenance monta a proposta certa para o tamanho do seu parque.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero ajuda para escolher o plano certo do RLP Maintenance CMMS.")}
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
