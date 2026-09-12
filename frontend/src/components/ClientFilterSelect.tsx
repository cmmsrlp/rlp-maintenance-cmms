import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown } from "lucide-react";
import { getClient, listClients } from "../api/clients";
import type { ServiceCategory } from "../api/types";
import { clientDisplayName } from "../lib/format";

interface ClientFilterSelectProps {
  value: string;
  onChange: (clientId: string) => void;
  service?: ServiceCategory;
  className?: string;
  allLabel?: string;
}

/**
 * Filtro de cliente por busca, para telas que listam dados de "todos os clientes ou um
 * so" (Kanban, programacao, listas de lubrificacao...). Antes era um <select> com os
 * primeiros 200 clientes: uma carteira maior que isso perdia clientes do filtro sem
 * nenhum aviso, o mesmo defeito ja corrigido nos seletores de formulario (ClientPicker,
 * InstrumentPicker etc). Diferente daqueles, este nao preenche um campo obrigatorio -
 * sempre tem a opcao "todos" e nao usa o padrao de input escondido do react-hook-form.
 */
export function ClientFilterSelect({ value, onChange, service, className, allLabel = "Todos os clientes" }: ClientFilterSelectProps) {
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
    queryKey: ["clients-filtro-busca", service ?? "any", buscaAplicada],
    queryFn: () => listClients({ search: buscaAplicada || undefined, service, pageSize: 20 }),
    enabled: aberto,
  });

  // O valor pode vir da URL (?clientId=) sem o cliente estar entre os resultados da busca
  // atual - busca a ficha so para exibir o nome no fechado.
  const { data: selecionado } = useQuery({
    queryKey: ["client-filtro-selecionado", value],
    queryFn: () => getClient(value),
    enabled: !!value,
  });

  function escolher(id: string) {
    onChange(id);
    setAberto(false);
    setTermo("");
  }

  const opcoes = data?.items ?? [];
  const rotulo = value ? clientDisplayName(selecionado) : allLabel;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {!aberto ? (
        <button
          type="button"
          className="input flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setAberto(true)}
        >
          <span className="min-w-0 truncate">{rotulo}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-graphite-400" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            type="text"
            autoFocus
            className="input pl-9"
            placeholder="Buscar por razao social, nome fantasia ou CNPJ"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onFocus={() => setAberto(true)}
          />
        </div>
      )}

      {aberto && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          <ul className="divide-y divide-gray-100">
            <li>
              <button
                type="button"
                className="flex w-full items-center px-3 py-2 text-left text-sm font-medium text-navy-900 hover:bg-gray-50"
                onClick={() => escolher("")}
              >
                {allLabel}
              </button>
            </li>
            {isFetching && opcoes.length === 0 && buscaAplicada ? (
              <li className="px-3 py-2 text-sm text-graphite-500">Buscando...</li>
            ) : opcoes.length === 0 && buscaAplicada ? (
              <li className="px-3 py-2 text-sm text-graphite-500">Nenhum cliente encontrado para "{buscaAplicada}".</li>
            ) : (
              opcoes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => escolher(c.id)}
                  >
                    {c.logoUrl && (
                      <img src={c.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-gray-200 object-cover" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{c.tradeName || c.companyName}</span>
                      {c.tradeName && c.companyName !== c.tradeName && (
                        <span className="block truncate text-xs text-graphite-400">{c.companyName}</span>
                      )}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {data && data.total > opcoes.length && (
            <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-graphite-400">
              Mostrando {opcoes.length} de {data.total} - refine a busca para ver os demais.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
