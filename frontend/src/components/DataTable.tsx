import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "./EmptyState";
import type { PagedResult } from "../api/client";

export interface Column<T> {
  header: string;
  accessor: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Botao de acao mostrado junto do estado vazio (ex.: "Novo cliente") - convida a
   * primeira acao em vez de so avisar que nao ha nada. */
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  pagination?: Pick<PagedResult<unknown>, "page" | "pageSize" | "total" | "totalPages">;
  onPageChange?: (page: number) => void;
}

/**
 * Abaixo de md (768px) a tabela vira uma lista de cartoes - nao um <table> encolhido.
 *
 * O <table> largo com rolagem horizontal (unico jeito que isto renderizava antes) some
 * inteiro; sem alternativa pra celular, colunas do fim (normalmente o status) saiam de
 * tela sem nenhum aviso, so a barra de rolagem nativa pra descobrir que tinha mais coisa.
 * Nenhuma tela que usa DataTable precisa saber disso - o mesmo array de `columns` alimenta
 * as duas versoes.
 *
 * Coluna sem `header` (ex.: a caixinha de selecao) vira um controle solto no canto
 * superior direito do cartao, em vez de um par rotulo/valor sem rotulo. A primeira coluna
 * com rotulo vira o titulo do cartao; o resto entra numa grade compacta de rotulo/valor.
 */
function RowCards<T>({ columns, rows, keyField, onRowClick }: Pick<DataTableProps<T>, "columns" | "rows" | "keyField" | "onRowClick">) {
  const controles = columns.filter((c) => !c.header);
  const [titulo, ...resto] = columns.filter((c) => c.header);

  return (
    <div className="divide-y divide-gray-100 md:hidden">
      {rows.map((row) => (
        <div
          key={keyField(row)}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={onRowClick ? "cursor-pointer p-4 active:bg-navy-50/60" : "p-4"}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-sm font-semibold text-navy-900">{titulo ? titulo.accessor(row) : null}</div>
            {controles.length > 0 && (
              <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {controles.map((c, i) => (
                  <span key={i}>{c.accessor(row)}</span>
                ))}
              </div>
            )}
          </div>
          {resto.length > 0 && (
            <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
              {resto.map((c) => (
                <div key={c.header} className="min-w-0 text-xs">
                  <span className="block text-graphite-400">{c.header}</span>
                  <span className="mt-0.5 block truncate text-graphite-700">{c.accessor(row)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  keyField,
  loading,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription,
  emptyAction,
  onRowClick,
  pagination,
  onPageChange,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="table-shell">
        <div className="animate-pulse divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className="table-shell">
      <RowCards columns={columns} rows={rows} keyField={keyField} onRowClick={onRowClick} />

      <table className="table-base hidden md:table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.header} className={col.className}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={keyField(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
              {columns.map((col) => (
                <td key={col.header} className={col.className}>
                  {col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pagination && pagination.totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm text-graphite-600">
          <span>
            Página {pagination.page} de {pagination.totalPages} - {pagination.total} registros
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
