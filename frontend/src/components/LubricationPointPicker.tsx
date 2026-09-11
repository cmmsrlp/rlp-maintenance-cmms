import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { listLubricationPoints } from "../api/lubrication";
import type { LubricationPoint } from "../api/types";

interface LubricationPointPickerProps {
  clientId?: string;
  placeholder?: string;
  /** Pontos que ja estao na rota - somem das opcoes, para nao adicionar de novo. */
  excludeIds: string[];
  /** Dispara ao escolher um ponto - quem chama decide o que fazer (aqui, empilhar na
   * rota). Ao contrario dos outros seletores, este nao guarda um valor proprio: e' "somar
   * mais um" repetidas vezes, nao "escolher um valor de um campo". */
  onSelect: (point: LubricationPoint) => void;
}

/**
 * Busca de ponto de lubrificacao por codigo, nome ou componente - digitando, para montar
 * uma rota. Antes era um <select> com os primeiros 500 pontos do cliente: um parque de
 * milhares de ativos pode gerar milhares de pontos, e a maioria simplesmente nao aparecia
 * na lista para montar a rota.
 */
export function LubricationPointPicker({ clientId, placeholder, excludeIds, onSelect }: LubricationPointPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [termo, setTermo] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["lubrication-points-busca", clientId ?? "own", buscaAplicada],
    queryFn: () => listLubricationPoints({ clientId, search: buscaAplicada || undefined, pageSize: 20 }),
    enabled: aberto,
  });

  const opcoes = (data?.items ?? []).filter((p) => !excludeIds.includes(p.id));

  function escolher(p: LubricationPoint) {
    onSelect(p);
    setTermo("");
    setAberto(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
        <input
          type="text"
          className="input pl-9"
          placeholder={placeholder ?? "Buscar por codigo, nome ou componente"}
          value={termo}
          onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
        />
      </div>

      {aberto && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">Buscando...</p>
          ) : opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">
              {buscaAplicada ? `Nenhum ponto encontrado para "${buscaAplicada}".` : "Digite para buscar um ponto."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {opcoes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => escolher(p)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{p.code} - {p.name}</span>
                      <span className="block truncate text-xs text-graphite-400">
                        {p.instrument?.tag ?? "sem TAG"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && data.total > (data?.items ?? []).length && (
            <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-graphite-400">
              Mostrando {opcoes.length} de {data.total} - refine a busca para ver os demais.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
