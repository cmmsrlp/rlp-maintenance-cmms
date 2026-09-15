import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { getRotableInstallationHistory } from "../api/rotableEquipment";
import { EmptyState } from "./EmptyState";
import { formatDate } from "../lib/format";

interface Props {
  instrumentId: string;
  /** Prefixo das rotas do portal/gestao ("/portal/manutencao" ou "/gestao/manutencao"). */
  base: string;
}

/**
 * Historico de equipamentos recondicionaveis que ja ocuparam esta posicao/ativo - do mais
 * recente pro mais antigo. O que esta instalado agora tambem aparece aqui (primeira linha,
 * sem data de saida), alem de ja estar na aba Manutencao - esta aba e' o "quem passou por
 * aqui", nao so o "quem esta aqui agora".
 */
export function AssetRotableHistory({ instrumentId, base }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["rotable-installation-history", instrumentId],
    queryFn: () => getRotableInstallationHistory(instrumentId),
    enabled: !!instrumentId,
  });

  const catalogo = `${base}/equipamentos-recondicionaveis`;

  return (
    <div className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold text-navy-900">
        <History className="h-5 w-5 text-navy-600" /> Historico de instalacoes
      </h2>
      <p className="mt-0.5 text-xs text-graphite-500">
        Equipamentos que ja ocuparam esta posicao - do mais recente pro mais antigo.
      </p>

      {isLoading ? (
        <p className="mt-3 text-sm text-graphite-400">Carregando...</p>
      ) : !data || data.length === 0 ? (
        <div className="mt-3">
          <EmptyState
            title="Nenhuma instalacao registrada"
            description="Instale um equipamento recondicionavel neste ativo para o historico comecar a aparecer aqui."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {data.map((installation) => (
            <li key={installation.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
              <div className="min-w-0">
                {installation.rotable ? (
                  <Link to={`${catalogo}/${installation.rotable.id}`} className="font-medium text-navy-900 hover:underline">
                    {installation.rotable.code}
                  </Link>
                ) : (
                  <p className="font-medium text-navy-900">Equipamento removido</p>
                )}
                <p className="truncate text-xs text-graphite-400">
                  {installation.rotable?.type}
                  {installation.rotable?.manufacturer ? ` - ${installation.rotable.manufacturer}` : ""}
                  {installation.rotable?.serialNumber ? ` - S/N ${installation.rotable.serialNumber}` : ""}
                </p>
                {installation.removalReason && (
                  <p className="mt-1 text-xs text-graphite-500">Motivo da saida: {installation.removalReason}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium text-navy-800">
                  {formatDate(installation.installedAt)} - {installation.removedAt ? formatDate(installation.removedAt) : "hoje"}
                </p>
                {!installation.removedAt && (
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-safety-green-dark">
                    <span className="h-1.5 w-1.5 rounded-full bg-current" /> Instalado agora
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
