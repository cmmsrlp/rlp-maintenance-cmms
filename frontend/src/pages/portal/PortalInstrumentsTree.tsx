import { useNavigate } from "react-router-dom";
import { List } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { AssetTree } from "../../components/AssetTree";

/** Mesma arvore da gestao, mas sempre escopada a propria empresa - sem seletor de cliente.
 * O backend forca a empresa do usuario logado, entao nao ha clientId aqui para escolher.
 *
 * Entrada padrao ao clicar em "Meus ativos" no menu - a lista (formato tabela) fica um
 * clique adiante, no botao "Ver lista de ativos". */
export default function PortalInstrumentsTree() {
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader
        title="Árvore de ativos"
        description="Estrutura pai/filho dos seus ativos - clique no + para expandir os componentes"
        actions={
          <button className="btn-outline" onClick={() => navigate("/portal/ativos/lista")}>
            <List className="h-4 w-4" /> Ver lista de ativos
          </button>
        }
      />
      <AssetTree clientId="" linkBase="/portal/ativos" />
    </div>
  );
}
