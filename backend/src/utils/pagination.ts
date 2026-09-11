export interface PageParams {
  page: number;
  pageSize: number;
}

export function parsePageParams(query: Record<string, unknown>): PageParams {
  const page = Math.max(1, Number(query.page) || 1);
  // Varias telas usam pageSize alto de proposito para carregar tudo de uma vez (seletor
  // de cliente, quadro Kanban, peças/mao de obra de uma OS) - nao sao paginas de verdade,
  // sao "a lista inteira". Um teto baixo aqui cortava esses casos silenciosamente (foi o
  // mesmo bug que escondia uma planta inteira da arvore de ativos). 1000 cobre qualquer
  // parque de cliente de porte medio/grande sem reabrir esse problema.
  const pageSize = Math.min(1000, Math.max(1, Number(query.pageSize) || 20));
  return { page, pageSize };
}

export function toSkipTake({ page, pageSize }: PageParams) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPagedResult<T>(items: T[], total: number, params: PageParams): PagedResult<T> {
  return {
    items,
    page: params.page,
    pageSize: params.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}
