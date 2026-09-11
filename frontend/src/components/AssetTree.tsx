import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, Building2, Box, AlertTriangle, Loader2 } from "lucide-react";
import type { Instrument } from "../api/types";
import { listInstruments } from "../api/instruments";
import { ASSET_LEVEL_ICONS } from "../lib/assetHierarchy";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";
import { FullPageSpinner } from "./Spinner";

interface AssetTreeProps {
  /** Empresa dona da arvore. Pode vir vazio no portal do cliente - o backend forca a
   * propria empresa do usuario de qualquer forma, o valor aqui so entra na chave da
   * consulta e no filtro quando quem pergunta e' a equipe interna. */
  clientId: string;
  /** Prefixo de rota para onde a ficha de cada ativo abre ("/gestao/ativos" ou "/portal/ativos"). */
  linkBase: string;
  /** Rotulo do no raiz da arvore (nome da empresa) - so faz sentido na gestao, que ve varios clientes. */
  rootLabel?: string;
}

/**
 * Arvore de ativos com carregamento sob demanda: busca so os ativos-raiz da empresa de
 * cara, e os filhos de cada no so quando o "+" e' clicado.
 *
 * Antes a tela buscava o parque inteiro do cliente numa unica chamada (ate' com o teto de
 * paginacao contornado) e montava a arvore inteira no navegador. Isso quebra num cliente
 * de 5 a 10 mil ativos: a resposta fica pesada e a maior parte da arvore nem aparece
 * aberta. Cada nivel agora e' uma consulta pequena, e so os galhos que o usuario abre
 * chegam a ser buscados.
 */
export function AssetTree({ clientId, linkBase, rootLabel }: AssetTreeProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["asset-tree-roots", clientId],
    queryFn: () => listInstruments({ clientId: clientId || undefined, rootOnly: true, all: true }),
  });
  const roots = data?.items ?? [];

  if (isLoading) return <FullPageSpinner />;
  if (roots.length === 0) {
    return <EmptyState title="Nenhum ativo cadastrado" description="Cadastre o primeiro ativo para comecar a montar a arvore." />;
  }

  return (
    <div className="card p-5">
      {rootLabel && (
        <div className="mb-2 flex items-center gap-2 pb-2 text-sm font-semibold text-navy-900">
          <Building2 className="h-4 w-4" /> {rootLabel}
        </div>
      )}
      <ul>
        {roots.map((instrument) => (
          <TreeRow key={instrument.id} instrument={instrument} clientId={clientId} linkBase={linkBase} depth={0} defaultOpen />
        ))}
      </ul>
    </div>
  );
}

function TreeRow({
  instrument,
  clientId,
  linkBase,
  depth,
  defaultOpen = false,
}: {
  instrument: Instrument;
  clientId: string;
  linkBase: string;
  depth: number;
  defaultOpen?: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const hasChildren = (instrument.childrenCount ?? 0) > 0;
  const LevelIcon = (instrument.assetTypeLevel && ASSET_LEVEL_ICONS[instrument.assetTypeLevel]) || Box;
  const alert = instrument.criticality === "CRITICAL" || (instrument.derivedStatus ?? instrument.status) === "EXPIRED";

  // So busca os filhos quando o galho e' aberto - e fica em cache do react-query dali pra
  // frente, entao fechar e abrir de novo nao repete a consulta.
  const { data: childrenData, isLoading: loadingChildren } = useQuery({
    queryKey: ["asset-tree-children", instrument.id],
    queryFn: () => listInstruments({ clientId: clientId || undefined, parentId: instrument.id, all: true }),
    enabled: open && hasChildren,
  });
  const children = childrenData?.items ?? [];

  return (
    <li className={depth > 0 ? "border-l border-gray-200" : ""}>
      <div
        className="group flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 hover:bg-navy-50/60"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
        onClick={() => navigate(`${linkBase}/${instrument.id}`)}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={open ? "Recolher" : "Expandir"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-300 bg-white text-graphite-500 hover:border-navy-400 hover:text-navy-700"
          >
            {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        {/* Foto no lugar do icone quando existe: reconhecer o equipamento pela imagem e' mais
            rapido do que ler o TAG, e o icone generico nao acrescenta nada quando ha foto. */}
        {instrument.photoUrl ? (
          <img
            src={instrument.photoUrl}
            alt=""
            className="h-7 w-7 shrink-0 rounded border border-gray-200 object-cover"
          />
        ) : (
          <LevelIcon className="h-4 w-4 shrink-0 text-navy-500" />
        )}
        <span className="font-mono text-sm font-semibold text-navy-900">{instrument.tag ?? "sem TAG"}</span>
        {/* A descricao e' o nome em linguagem de gente - e' por ela que a equipe reconhece o
            ativo. O tipo/modelo ficam depois, e so aparecem se existirem (antes saia "· null"). */}
        {instrument.description && (
          <span className="truncate text-sm text-graphite-700">{instrument.description}</span>
        )}
        <span className="shrink-0 text-xs text-graphite-400">
          {[instrument.type, instrument.model].filter(Boolean).join(" · ")}
        </span>
        {alert && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-safety-red" aria-label="Atencao: critico ou vencido" />}
        <span className="ml-auto flex shrink-0 gap-1.5">
          {(instrument.criticality === "CRITICAL" || instrument.criticality === "HIGH") && (
            <StatusBadge status={instrument.criticality} />
          )}
          <StatusBadge status={instrument.derivedStatus ?? instrument.status} />
        </span>
        {hasChildren && (
          <span className="shrink-0 text-xs text-graphite-400">
            {instrument.childrenCount} {instrument.childrenCount === 1 ? "componente" : "componentes"}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {loadingChildren ? (
            <li className="flex items-center gap-2 py-2 pl-8 text-xs text-graphite-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </li>
          ) : (
            children.map((child) => (
              <TreeRow key={child.id} instrument={child} clientId={clientId} linkBase={linkBase} depth={depth + 1} />
            ))
          )}
        </ul>
      )}
    </li>
  );
}
