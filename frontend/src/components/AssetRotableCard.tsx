import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Plus } from "lucide-react";
import { listRotableEquipment } from "../api/rotableEquipment";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

interface Props {
  instrumentId: string;
  clientId?: string;
  /** Prefixo das rotas do portal/gestao ("/portal/manutencao" ou "/gestao/manutencao"). */
  base: string;
}

/**
 * O equipamento recondicionavel instalado neste ativo agora, na propria ficha dele.
 *
 * O Ativo e' o local/posicao; o motor/redutor/rolo que ocupa esse local hoje e' uma peca
 * fisica separada, que pode ter passado por outras maquinas antes e vai passar por outras
 * depois. Aqui aparece so o estado atual - o historico completo (instalacoes, reparos) fica
 * na ficha do proprio equipamento, um clique adiante.
 */
export function AssetRotableCard({ instrumentId, clientId, base }: Props) {
  const { data } = useQuery({
    queryKey: ["rotable-equipment-do-ativo", instrumentId],
    queryFn: () => listRotableEquipment({ instrumentId, clientId, pageSize: 5 }),
    enabled: !!instrumentId,
  });

  const instalado = data?.items?.[0] ?? null;
  const catalogo = `${base}/equipamentos-recondicionaveis`;

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-navy-900">
          <RefreshCw className="h-5 w-5 text-navy-600" /> Equipamento recondicionavel
        </h2>
        <Link className="btn-outline text-sm" to={catalogo}>
          <Plus className="h-4 w-4" /> Ver catalogo
        </Link>
      </div>

      {!instalado ? (
        <div className="mt-3">
          <EmptyState
            title="Nenhum equipamento instalado"
            description="Motor, redutor, rolo... cadastre no catalogo e instale aqui quando houver um."
          />
        </div>
      ) : (
        <Link to={`${catalogo}/${instalado.id}`} className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50">
          <div className="min-w-0">
            <p className="font-medium text-navy-900">{instalado.code}</p>
            <p className="truncate text-xs text-graphite-400">
              {instalado.type}
              {instalado.manufacturer ? ` - ${instalado.manufacturer}` : ""}
              {instalado.serialNumber ? ` - S/N ${instalado.serialNumber}` : ""}
            </p>
          </div>
          <StatusBadge status={instalado.status} />
        </Link>
      )}
    </div>
  );
}
