import { PageHeader } from "../../components/PageHeader";
import { AssetTree } from "../../components/AssetTree";

/** Mesma arvore da gestao, mas sempre escopada a propria empresa - sem seletor de cliente.
 * O backend forca a empresa do usuario logado, entao nao ha clientId aqui para escolher. */
export default function PortalInstrumentsTree() {
  return (
    <div>
      <PageHeader title="Arvore de ativos" description="Estrutura pai/filho dos seus ativos - clique no + para expandir os componentes" />
      <AssetTree clientId="" linkBase="/portal/ativos" />
    </div>
  );
}
