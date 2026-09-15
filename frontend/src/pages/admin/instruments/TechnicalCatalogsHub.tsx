import { Link } from "react-router-dom";
import { Tags, Factory, Workflow, ChevronRight, ListChecks, OctagonPause, LayoutTemplate, HardHat, ClipboardPlus, IdCard, FolderKanban, RefreshCw } from "lucide-react";
import { PageHeader } from "../../../components/PageHeader";
import { useCmms } from "../../../lib/cmms";

/** Ponto unico de entrada dos cadastros de apoio do CMMS. Em vez de cada catalogo virar
 * um item de menu (o menu ficava enorme e misturava operacao com configuracao), tudo que
 * e' "configura uma vez e usa sempre" fica aqui, agrupado por assunto. */
export default function TechnicalCatalogsHub() {
  const { assetsBase, base, laborBase } = useCmms();

  const groups = [
    {
      title: "Estrutura de ativos",
      description: "Como a fábrica é organizada - preencha antes de cadastrar os equipamentos.",
      items: [
        { to: `${assetsBase}/tipos`, icon: Tags, title: "Classes de ativo", description: "Nível na hierarquia (Planta, Máquina, Subconjunto, Parte...)" },
        { to: `${assetsBase}/plantas`, icon: Factory, title: "Plantas", description: "Unidades/fábricas da empresa" },
        // Um cadastro so: o centro de custo existe por causa da area, e mante-los em
        // telas separadas obrigava a cadastrar o centro antes para so entao voltar aqui.
        { to: `${assetsBase}/areas`, icon: Workflow, title: "Áreas / Centros de custo", description: "Áreas da planta e o centro de custo em que cada uma rateia" },
      ],
    },
    {
      title: "Manutenção",
      description: "Padrões que a operação usa no dia a dia ao abrir e executar ordens.",
      items: [
        { to: `${base}/modelos-de-plano`, icon: LayoutTemplate, title: "Modelos de plano", description: "Planos reutilizáveis por família de ativo" },
        { to: `${base}/equipamentos-recondicionaveis`, icon: RefreshCw, title: "Equipamentos recondicionáveis", description: "Motor, redutor, rolo... unidades físicas que se movem entre ativos, estoque e reparo" },
        { to: `${base}/falhas`, icon: ListChecks, title: "Códigos de falha", description: "Causas usadas nas ordens corretivas e no Pareto" },
        { to: `${base}/paradas`, icon: OctagonPause, title: "Motivos de parada", description: "Por que a máquina ficou parada durante o serviço" },
        { to: `${base}/categorias-solicitacao`, icon: FolderKanban, title: "Categorias de solicitação", description: "Classificação usada ao abrir uma solicitação de serviço" },
      ],
    },
    {
      title: "Equipe",
      description: "Quem executa a manutenção - alimenta a programação e o custo de mão de obra.",
      items: [
        { to: laborBase, icon: HardHat, title: "Mão de obra", description: "Equipe de manutenção, função e valor/hora" },
        { to: `${base}/tipos-mao-de-obra`, icon: IdCard, title: "Tipos de mão de obra", description: "Funções da equipe (Técnico mecânico, Eletricista, Lubrificador...)" },
        { to: `${base}/solicitacoes`, icon: ClipboardPlus, title: "Solicitações de serviço", description: "Fila de pedidos abertos pela operação" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader
        title="Cadastros técnicos"
        description="Configure uma vez e use sempre - estrutura de ativos, padrões de manutenção e equipe"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Cadastros técnicos" }]}
      />

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="font-semibold text-navy-900">{group.title}</h2>
            <p className="mb-3 text-sm text-graphite-500">{group.description}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.items.map((item) => (
                <Link key={item.to} to={item.to} className="card flex items-center gap-4 p-5 transition-shadow hover:shadow-md">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700">
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-navy-900">{item.title}</h3>
                    <p className="text-sm text-graphite-500">{item.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-graphite-400" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
