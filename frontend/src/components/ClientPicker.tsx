import { forwardRef, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ChevronDown } from "lucide-react";
import { getClient, listClients } from "../api/clients";

interface ClientPickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  name: string;
  value?: string;
  // Assinaturas compativeis com o que o react-hook-form entrega em register().
  onChange?: (e: { target: { name: string; value: string } }) => unknown;
  onBlur?: (e: never) => unknown;
}

/**
 * Busca de cliente por razao social, nome fantasia ou CNPJ - digitando.
 *
 * Antes era um <select> com os primeiros 100 clientes (mesmo padrao ja corrigido nos
 * seletores de ativo pai e de peca): uma carteira maior que isso perdia clientes da lista
 * sem nenhum aviso. A busca vai ao servidor e traz so os que combinam com o que foi
 * digitado.
 */
export const ClientPicker = forwardRef<HTMLInputElement, ClientPickerProps>(function ClientPicker(
  { label = "Cliente", hint, error, required, name, onChange, onBlur },
  ref,
) {
  const escondido = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [termo, setTermo] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aberto, setAberto] = useState(false);

  // Espera o usuario parar de digitar antes de ir ao servidor.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(termo.trim()), 300);
    return () => clearTimeout(t);
  }, [termo]);

  // Fecha ao clicar fora - senao a lista fica pendurada sobre o resto do formulario.
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["clients-busca", buscaAplicada],
    queryFn: () => listClients({ search: buscaAplicada || undefined, pageSize: 20 }),
    enabled: aberto,
  });

  // Ao editar, o valor ja vem preenchido: busca a ficha so para mostrar de quem se trata.
  const { data: selecionado } = useQuery({
    queryKey: ["client-selecionado", selecionadoId],
    queryFn: () => getClient(selecionadoId),
    enabled: !!selecionadoId,
  });

  /** O valor tambem chega de fora: o formulario faz reset ao carregar um registro existente
   * e escreve direto na propriedade .value do input escondido, o que nao dispara evento
   * nenhum. Uma verificacao periodica curta e' o jeito simples de o rotulo visivel
   * acompanhar isso sem mudar a forma como as telas registram o campo. */
  useEffect(() => {
    const intervalo = setInterval(() => {
      const atual = escondido.current?.value ?? "";
      setSelecionadoId((anterior) => (atual !== anterior ? atual : anterior));
    }, 300);
    return () => clearInterval(intervalo);
  }, []);

  function escolher(id: string) {
    if (escondido.current) escondido.current.value = id;
    setSelecionadoId(id);
    setAberto(false);
    setTermo("");
    onChange?.({ target: { name, value: id } });
  }

  const rotuloDoSelecionado = selecionado ? selecionado.tradeName || selecionado.companyName : "";

  const opcoes = data?.items ?? [];

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-sm font-medium text-graphite-700">
        {label}
        {required && <span className="ml-0.5 text-safety-red">*</span>}
      </label>

      {/* O input de verdade do formulario: guarda o id, invisivel. */}
      <input
        type="hidden"
        name={name}
        ref={(el) => {
          escondido.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        onBlur={onBlur as never}
      />

      {selecionadoId && !aberto ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-sm text-graphite-800">
            {rotuloDoSelecionado || "Carregando..."}
          </span>
          <button
            type="button"
            className="shrink-0 text-graphite-400 hover:text-navy-700"
            onClick={() => { setAberto(true); setTermo(""); }}
            aria-label="Trocar cliente"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="shrink-0 text-graphite-400 hover:text-safety-red"
            onClick={() => escolher("")}
            aria-label="Limpar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Buscar por razao social, nome fantasia ou CNPJ"
            value={termo}
            onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
          />
        </div>
      )}

      {aberto && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">Buscando...</p>
          ) : opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">
              {buscaAplicada ? `Nenhum cliente encontrado para "${buscaAplicada}".` : "Digite para buscar um cliente."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {opcoes.map((c) => (
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
              ))}
            </ul>
          )}
          {/* Sinaliza que a lista e' um recorte: sem isso o usuario acha que a carteira so
              tem estes clientes. */}
          {data && data.total > opcoes.length && (
            <p className="border-t border-gray-100 px-3 py-1.5 text-xs text-graphite-400">
              Mostrando {opcoes.length} de {data.total} - refine a busca para ver os demais.
            </p>
          )}
        </div>
      )}

      {hint && !error && <p className="mt-1 text-xs text-graphite-400">{hint}</p>}
      {error && <p className="mt-1 text-xs text-safety-red">{error}</p>}
    </div>
  );
});
