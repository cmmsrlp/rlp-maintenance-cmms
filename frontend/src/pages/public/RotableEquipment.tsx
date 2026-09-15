import { Link } from "react-router-dom";
import {
  ArrowRight,
  Recycle,
  PackageSearch,
  History,
  FileText,
  Camera,
  Receipt,
  CheckCircle2,
  MessageCircle,
  AlertTriangle,
} from "lucide-react";
import { buildWhatsAppLink } from "../../lib/publicContact";
import { Seo } from "../../components/Seo";

const CAPACIDADES = [
  {
    icon: PackageSearch,
    title: "Status sempre visível",
    description:
      "Em estoque, instalado ou em reparo - cada motor, redutor, bomba ou rolo mostra onde está agora, sem precisar ligar pro fornecedor pra saber.",
  },
  {
    icon: Receipt,
    title: "Orçamento com requisição vinculada",
    description:
      "Anexe o orçamento que o fornecedor mandou junto do número da requisição de compras - fica registrado o que foi autorizado e por quem.",
  },
  {
    icon: FileText,
    title: "Ficha de envio em PDF",
    description:
      "Gere automaticamente a ficha com dados do equipamento, ficha técnica e defeito informado - pronta pra quem vai emitir a nota fiscal de remessa.",
  },
  {
    icon: History,
    title: "Histórico completo, sem perder nada",
    description:
      "Instalações e reparos arquivados separados do que está em andamento agora - o histórico de cada equipamento fica todo rastreável.",
  },
  {
    icon: Camera,
    title: "Foto do equipamento",
    description:
      "Cada equipamento recondicionável carrega a própria foto, junto do número de série e ficha técnica - identificação visual sem depender de etiqueta.",
  },
  {
    icon: CheckCircle2,
    title: "Nota fiscal de retorno fecha o ciclo",
    description:
      "No retorno, registre a nota fiscal que a empresa reparadora emitiu - o ciclo de envio e retorno fica documentado do início ao fim.",
  },
];

export default function RotableEquipment() {
  return (
    <div>
      <Seo
        title="Equipamentos recondicionáveis"
        description="Rastreie motores, redutores, bombas e rolos entre estoque, instalação e reparo - orçamento, requisição de compras, ficha de envio e nota fiscal de retorno em um só lugar."
        path="/equipamentos-recondicionaveis"
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
              <Recycle className="h-3.5 w-3.5" /> Equipamentos recondicionáveis
            </span>
            <h1 className="mt-5 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl">
              Motor mandado pra conserto não é motor perdido de vista
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-navy-200">
              Toda empresa que troca motor, redutor, bomba ou rolo por reparo sabe a dor: o equipamento sai da
              fábrica e some do controle - ninguém sabe se já tem orçamento, quanto vai custar ou quando volta. O
              RLP Maintenance CMMS rastreia cada unidade do estoque ao reparo e de volta, com orçamento, requisição
              de compras e nota fiscal de retorno amarrados na mesma tela.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href={buildWhatsAppLink("Ola! Quero conhecer o controle de equipamentos recondicionaveis do RLP Maintenance CMMS.")}
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
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Equipamentos recondicionáveis</p>
              <div className="mb-3.5 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-graphite-50 px-2 py-2.5">
                  <p className="text-lg font-extrabold text-navy-900">1</p>
                  <p className="text-[10px] font-semibold text-graphite-500">Em estoque</p>
                </div>
                <div className="rounded-lg bg-graphite-50 px-2 py-2.5">
                  <p className="text-lg font-extrabold text-navy-900">1</p>
                  <p className="text-[10px] font-semibold text-graphite-500">Instalados</p>
                </div>
                <div className="rounded-lg bg-brand-lime/10 px-2 py-2.5">
                  <p className="text-lg font-extrabold text-navy-900">2</p>
                  <p className="text-[10px] font-semibold text-brand-lime-dark">Em reparo</p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { codigo: "BMB-503", tipo: "Bomba KSB", status: "Aguardando orçamento", cor: "bg-amber-100 text-amber-700" },
                  { codigo: "CMP-504", tipo: "Compressor Atlas Copco", status: "Em reparo", cor: "bg-amber-100 text-amber-700" },
                  { codigo: "RED-502", tipo: "Redutor SEW", status: "Instalado", cor: "bg-brand-lime/15 text-brand-lime-dark" },
                ].map((r) => (
                  <div key={r.codigo} className="flex items-center justify-between rounded-lg bg-graphite-50 px-3.5 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-navy-900">{r.codigo}</p>
                      <p className="text-[11px] text-graphite-500">{r.tipo}</p>
                    </div>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + r.cor}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-5 -left-5 hidden items-center gap-2 rounded-lg bg-white px-4 py-3 shadow-xl sm:flex">
              <AlertTriangle className="h-4 w-4 shrink-0 text-brand-lime-dark" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-400">Imobilizado em reparo</p>
                <p className="text-lg font-extrabold text-navy-900">R$ 10.800,00</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-bold uppercase tracking-wider text-brand-lime-dark">Como funciona</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl">
            Do estoque ao reparo, sem perder o fio
          </h2>
          <p className="mt-4 text-graphite-500">
            Seis capacidades para o equipamento rotativo deixar de ser uma dúvida no WhatsApp com o fornecedor e virar
            um registro rastreável, do envio ao retorno.
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
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-lime">Ordem de reparo</span>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Cada envio com orçamento, requisição e retorno na mesma ficha
            </h2>
            <p className="mt-4 text-navy-200">
              Quando o equipamento sai pra reparo, o CMMS já gera a ficha de envio em PDF com a ficha técnica e o
              defeito informado. Quando o orçamento chega, fica anexado junto do número da requisição de compras. E
              quando o equipamento retorna, a nota fiscal de retorno fecha o ciclo - tudo na mesma tela, sem planilha
              paralela.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                "Status \"em reparo - aguardando orçamento\" até o fornecedor responder",
                "Anexo do orçamento com número da requisição de compras ou pedido",
                "Nota fiscal de retorno registrada ao fechar a ordem de reparo",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-navy-100">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-lime" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="rounded-xl bg-white p-5 shadow-2xl">
              <div className="mb-3.5 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-graphite-400">CMP-504 · Reparos (1)</p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Pendente</span>
              </div>
              <p className="text-sm font-bold text-navy-900">CompAir Serviços - orçamento ORC-4471</p>
              <p className="mt-0.5 text-[11px] text-graphite-500">Garantia - enviado em 15/09/2026</p>
              <div className="mt-3.5 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-graphite-50 px-3 py-2">
                  <span className="text-graphite-500">Valor orçado</span>
                  <span className="font-bold text-navy-900">R$ 1.850,00</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-graphite-50 px-3 py-2">
                  <span className="text-graphite-500">Requisição de compras</span>
                  <span className="font-bold text-navy-900">REQ-2026-0334</span>
                </div>
              </div>
              <div className="mt-3.5 flex gap-2">
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-graphite-200 px-3 py-2 text-xs font-bold text-graphite-700">
                  <FileText className="h-3.5 w-3.5" /> Ficha de envio
                </span>
                <span className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-lime px-3 py-2 text-xs font-bold text-navy-950">
                  Registrar retorno
                </span>
              </div>
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
          <Recycle className="h-10 w-10 text-brand-lime" />
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Nunca mais perca o controle de um equipamento em conserto
          </h2>
          <p className="max-w-xl text-navy-300">
            Fale com a equipe da RLP Maintenance e veja o controle de equipamentos recondicionáveis funcionando com
            os motores, redutores e bombas da sua fábrica.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href={buildWhatsAppLink("Ola! Quero conhecer o controle de equipamentos recondicionaveis do RLP Maintenance CMMS.")}
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
