import { useQuery } from "@tanstack/react-query";
import { listInstruments } from "../../api/instruments";
import { PageHeader } from "../../components/PageHeader";
import { AssetTree } from "../../components/AssetTree";
import { FullPageSpinner } from "../../components/Spinner";

/** Mesma arvore da gestao, mas sempre escopada a propria empresa - sem seletor de cliente. */
export default function PortalInstrumentsTree() {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-instruments-tree"],
    queryFn: () => listInstruments({ pageSize: 500 }),
  });

  return (
    <div>
      <PageHeader title="Arvore de ativos" description="Estrutura pai/filho dos seus ativos - clique no + para expandir os componentes" />
      {isLoading ? <FullPageSpinner /> : <AssetTree instruments={data?.items ?? []} linkBase="/portal/ativos" />}
    </div>
  );
}
