import { useQuery } from "@tanstack/react-query";
import { Printer, Check } from "lucide-react";
import { listPlans } from "../../../api/plans";
import { PageHeader } from "../../../components/PageHeader";
import { FullPageSpinner } from "../../../components/Spinner";
import { EmptyState } from "../../../components/EmptyState";
import { formatCurrency } from "../../../lib/format";
import { CmmsLogo } from "../../../components/CmmsLogo";

/**
 * Gera a pagina de planos pronta para imprimir/exportar em PDF e mandar pro cliente -
 * direto dos planos cadastrados (Administracao da plataforma > Planos), sem depender de
 * alguem lembrar de atualizar uma arte separada toda vez que um preco ou limite muda.
 */
export default function PlanosArte() {
  const { data: plans, isLoading } = useQuery({
    queryKey: ["plans-arte"],
    queryFn: () => listPlans({ active: true }),
  });

  if (isLoading) return <FullPageSpinner />;

  const ordenados = [...(plans ?? [])].sort((a, b) => {
    // Sem preco (sob consulta) sempre por ultimo - e' o topo da escada, nao o meio.
    if (a.priceMonthly == null) return 1;
    if (b.priceMonthly == null) return -1;
    return a.priceMonthly - b.priceMonthly;
  });
  // O do meio e' o destaque visual (equivalente ao "Mais escolhido" do site) quando ha
  // 3 ou mais planos - com 1 ou 2 nao ha "meio" que faca sentido destacar.
  const indiceDestaque = ordenados.length >= 3 ? Math.floor((ordenados.length - 1) / 2) : -1;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Arte de planos para compartilhar"
          description="Gerada agora, a partir dos planos ativos cadastrados - sempre reflete o preço e os limites de verdade."
          breadcrumbs={[
            { label: "Administração da plataforma", to: "/gestao/plataforma" },
            { label: "Planos", to: "/gestao/plataforma/planos" },
            { label: "Arte" },
          ]}
          actions={
            <button className="btn-primary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
            </button>
          }
        />
      </div>

      {ordenados.length === 0 ? (
        <EmptyState
          title="Nenhum plano ativo"
          description="Cadastre ou reative um plano em Administração da plataforma > Planos para gerar a arte."
        />
      ) : (
        <div className="rounded-2xl bg-navy-900 print:rounded-none">
          <div className="mx-auto max-w-5xl px-6 py-10 text-center sm:px-10">
            <CmmsLogo variant="light" size="md" className="mx-auto" />
            <h1 className="mt-6 text-3xl font-extrabold text-white">Escolha o plano do seu CMMS</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-navy-200">
              Ativos, planos preventivos, ordens de serviço e almoxarifado num só lugar - sem letra miúda, sem
              integração de cobrança escondida.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-5 px-6 pb-10 sm:px-10 print:grid-cols-3" style={{ gridTemplateColumns: `repeat(${Math.min(ordenados.length, 3)}, minmax(0, 1fr))` }}>
            {ordenados.map((plano, i) => {
              const destaque = i === indiceDestaque;
              return (
                <div
                  key={plano.id}
                  className={
                    "flex flex-col rounded-xl p-6 " +
                    (destaque ? "bg-white shadow-2xl ring-2 ring-brand-lime" : "bg-navy-800/60 ring-1 ring-white/10")
                  }
                >
                  {destaque && (
                    <span className="mb-3 inline-block w-fit rounded-full bg-brand-lime px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-navy-950">
                      Mais escolhido
                    </span>
                  )}
                  <h2 className={"text-lg font-extrabold " + (destaque ? "text-navy-900" : "text-white")}>{plano.name}</h2>
                  {plano.description && (
                    <p className={"mt-1.5 text-xs leading-relaxed " + (destaque ? "text-graphite-500" : "text-navy-200")}>
                      {plano.description}
                    </p>
                  )}

                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className={"text-3xl font-extrabold tracking-tight " + (destaque ? "text-navy-900" : "text-white")}>
                      {plano.priceMonthly != null ? formatCurrency(plano.priceMonthly) : "Sob consulta"}
                    </span>
                    {plano.priceMonthly != null && (
                      <span className={"text-xs font-semibold " + (destaque ? "text-graphite-400" : "text-navy-300")}>/mês</span>
                    )}
                  </div>

                  <div className={"mt-4 flex gap-3 rounded-lg px-3 py-2.5 text-xs " + (destaque ? "bg-graphite-50" : "bg-white/5")}>
                    <div className="flex-1">
                      <span className={"block text-base font-extrabold tabular-nums " + (destaque ? "text-navy-900" : "text-white")}>
                        {plano.maxUsers ?? "∞"}
                      </span>
                      <span className={destaque ? "text-graphite-400" : "text-navy-300"}>usuários</span>
                    </div>
                    <div className="flex-1">
                      <span className={"block text-base font-extrabold tabular-nums " + (destaque ? "text-navy-900" : "text-white")}>
                        {plano.maxInstruments ?? "∞"}
                      </span>
                      <span className={destaque ? "text-graphite-400" : "text-navy-300"}>ativos</span>
                    </div>
                  </div>

                  <ul className="mt-5 flex-1 space-y-2">
                    {plano.features.map((item) => (
                      <li key={item} className={"flex items-start gap-2 text-xs leading-snug " + (destaque ? "text-graphite-700" : "text-navy-100")}>
                        <Check className={"mt-0.5 h-3.5 w-3.5 shrink-0 " + (destaque ? "text-brand-lime-dark" : "text-brand-lime")} />
                        {item}
                      </li>
                    ))}
                  </ul>

                  <span
                    className={
                      "mt-6 block rounded-md py-2.5 text-center text-xs font-bold " +
                      (destaque ? "bg-navy-900 text-white" : "bg-brand-lime text-navy-950")
                    }
                  >
                    Falar sobre o {plano.name}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="px-6 pb-8 text-center text-[11px] text-navy-300">
            RLP Maintenance - Reliability, Lifecycle &amp; Performance
          </p>
        </div>
      )}
    </div>
  );
}
