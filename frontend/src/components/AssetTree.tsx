import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Minus, Building2, Box, AlertTriangle } from "lucide-react";
import type { Instrument } from "../api/types";
import { ASSET_LEVEL_ICONS } from "../lib/assetHierarchy";
import { StatusBadge } from "./StatusBadge";
import { EmptyState } from "./EmptyState";

interface TreeNode {
  instrument: Instrument;
  children: TreeNode[];
}

/** Monta a arvore a partir da lista plana (parentId) - a mesma logica de qualquer
 * arvore de categorias: agrupa por pai, raizes sao quem nao tem parentId. */
function buildTree(items: Instrument[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(items.map((i) => [i.id, { instrument: i, children: [] }]));
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.instrument.parentId;
    if (parentId && byId.has(parentId)) {
      byId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

interface AssetTreeProps {
  instruments: Instrument[];
  /** Prefixo de rota para onde a ficha de cada ativo abre ("/gestao/ativos" ou "/portal/ativos"). */
  linkBase: string;
  /** Rotulo do no raiz da arvore (nome da empresa) - so faz sentido na gestao, que ve varios clientes. */
  rootLabel?: string;
}

/** Arvore de ativos com expandir/recolher em cada no que tem filhos - clique no +/-
 * (ou na linha) para ir abrindo compressor -> motor -> rolamento e assim por diante. */
export function AssetTree({ instruments, linkBase, rootLabel }: AssetTreeProps) {
  const tree = useMemo(() => buildTree(instruments), [instruments]);

  if (instruments.length === 0) {
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
        {tree.map((node) => (
          <TreeRow key={node.instrument.id} node={node} linkBase={linkBase} depth={0} defaultOpen />
        ))}
      </ul>
    </div>
  );
}

function TreeRow({ node, linkBase, depth, defaultOpen = false }: { node: TreeNode; linkBase: string; depth: number; defaultOpen?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(defaultOpen);
  const { instrument, children } = node;
  const hasChildren = children.length > 0;
  const LevelIcon = (instrument.assetTypeLevel && ASSET_LEVEL_ICONS[instrument.assetTypeLevel]) || Box;
  const alert = instrument.criticality === "CRITICAL" || (instrument.derivedStatus ?? instrument.status) === "EXPIRED";

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
            {children.length} {children.length === 1 ? "componente" : "componentes"}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <ul>
          {children.map((child) => (
            <TreeRow key={child.instrument.id} node={child} linkBase={linkBase} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
