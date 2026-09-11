import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listInstruments } from "../../../api/instruments";
import { listClients } from "../../../api/clients";
import { PageHeader } from "../../../components/PageHeader";
import { AssetTree } from "../../../components/AssetTree";
import { EmptyState } from "../../../components/EmptyState";
import { FullPageSpinner } from "../../../components/Spinner";
import { clientDisplayName } from "../../../lib/format";
import { useCmms } from "../../../lib/cmms";

/** Visao em arvore dos ativos de UM cliente por vez - pai/filho so faz sentido dentro
 * da mesma empresa, entao a gestao precisa escolher qual antes de montar a arvore. */
export default function InstrumentsTree() {
  const { base } = useCmms();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") ?? "";

  const { data: clients } = useQuery({
    queryKey: ["clients-picker-cmms"],
    queryFn: () => listClients({ pageSize: 200, service: "CMMS_MAINTENANCE" }),
  });
  const { data, isLoading } = useQuery({
    queryKey: ["instruments-tree", clientId],
    // scope=cmms: a arvore e' a estrutura do parque do cliente, nao a lista de itens que a
    // OptiProcess calibra. Sem isso a equipe interna via a arvore quase vazia, com so os
    // ativos calibraveis - e sem nenhuma pista de que faltava alguma coisa.
    queryFn: () => listInstruments({ clientId, pageSize: 500, scope: "cmms" }),
    enabled: !!clientId,
  });

  const client = clients?.items.find((c) => c.id === clientId);

  return (
    <div>
      <PageHeader
        title="Arvore de ativos"
        description="Estrutura pai/filho dos ativos - clique no + para expandir os componentes"
        breadcrumbs={[{ label: "RLP Maintenance CMMS", to: base }, { label: "Arvore de ativos" }]}
      />

      <div className="mb-6">
        <select
          className="input sm:w-72"
          value={clientId}
          onChange={(e) => setSearchParams(e.target.value ? { clientId: e.target.value } : {})}
        >
          <option value="">Selecione um cliente</option>
          {(clients?.items ?? []).map((c) => (
            <option key={c.id} value={c.id}>{clientDisplayName(c)}</option>
          ))}
        </select>
      </div>

      {!clientId ? (
        <EmptyState title="Selecione um cliente" description="Escolha a empresa para ver a arvore de ativos dela." />
      ) : isLoading ? (
        <FullPageSpinner />
      ) : (
        <AssetTree instruments={data?.items ?? []} linkBase="/gestao/ativos" rootLabel={client ? clientDisplayName(client) : undefined} />
      )}
    </div>
  );
}
