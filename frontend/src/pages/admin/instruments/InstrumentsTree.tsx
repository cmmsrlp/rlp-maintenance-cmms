import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "../../../api/clients";
import { PageHeader } from "../../../components/PageHeader";
import { AssetTree } from "../../../components/AssetTree";
import { ClientFilterSelect } from "../../../components/ClientFilterSelect";
import { EmptyState } from "../../../components/EmptyState";
import { clientDisplayName } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

/** Visao em arvore dos ativos de UM cliente por vez - pai/filho so faz sentido dentro
 * da mesma empresa, entao a gestao precisa escolher qual antes de montar a arvore. */
export default function InstrumentsTree() {
  const { base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";

  const { data: client } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId),
    enabled: !!clientId,
  });

  return (
    <div>
      <PageHeader
        title="Arvore de ativos"
        description="Estrutura pai/filho dos ativos - clique no + para expandir os componentes"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Arvore de ativos" }]}
      />

      <div className="mb-6">
        <ClientFilterSelect
          className="sm:w-72"
          value={clientId}
          onChange={(id) => setSearchParams(id ? { clientId: id } : {})}
          service="CMMS_MAINTENANCE"
          allLabel="Selecione um cliente"
        />
      </div>

      {!clientId ? (
        <EmptyState title="Selecione um cliente" description="Escolha a empresa para ver a arvore de ativos dela." />
      ) : (
        <AssetTree clientId={clientId} linkBase="/gestao/ativos" rootLabel={client ? clientDisplayName(client) : undefined} />
      )}
    </div>
  );
}
