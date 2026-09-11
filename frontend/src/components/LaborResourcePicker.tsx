import { forwardRef, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ChevronDown } from "lucide-react";
import { getLaborResource, listLaborResources } from "../api/laborResources";

interface LaborResourcePickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  clientId?: string;
  /** Tira estas pessoas das opcoes - usado para nao deixar adicionar de novo quem ja esta
   * na equipe da OS. */
  excludeIds?: string[];
  name: string;
  value?: string;
  // Assinaturas compativeis com o que o react-hook-form entrega em register().
  onChange?: (e: { target: { name: string; value: string } }) => unknown;
  onBlur?: (e: never) => unknown;
}

/**
 * Busca de pessoa da equipe por nome, funcao ou matricula - digitando.
 *
 * Mesmo padrao ja usado para ativo, peca e cliente: um <select> com as primeiras 200 (agora
 * 1000) pessoas perde silenciosamente o resto numa equipe grande. Aqui o risco e' menor
 * (equipe de manutencao raramente passa de algumas dezenas por cliente), mas o custo de
 * manter dois padroes diferentes de seletor no sistema e' maior que o de padronizar.
 */
export const LaborResourcePicker = forwardRef<HTMLInputElement, LaborResourcePickerProps>(function LaborResourcePicker(
  { label = "Pessoa", hint, error, required, className, placeholder, disabled, clientId, excludeIds, name, value, onChange, onBlur },
  ref,
) {
  const escondido = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [termo, setTermo] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (value !== undefined) setSelecionadoId(value);
  }, [value]);

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
    queryKey: ["labor-resources-busca", clientId ?? "own", buscaAplicada],
    queryFn: () => listLaborResources({ clientId, active: true, search: buscaAplicada || undefined, pageSize: 20 }),
    enabled: aberto && !disabled,
  });

  const { data: selecionado } = useQuery({
    queryKey: ["labor-resource-selecionado", selecionadoId],
    queryFn: () => getLaborResource(selecionadoId),
    enabled: !!selecionadoId,
  });

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

  const rotuloDoSelecionado = selecionado ? `${selecionado.name} (${selecionado.type})` : "";

  const opcoes = (data?.items ?? []).filter((r) => !excludeIds?.includes(r.id));

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-graphite-700">
          {label}
          {required && <span className="ml-0.5 text-safety-red">*</span>}
        </label>
      )}

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
          {!disabled && (
            <>
              <button
                type="button"
                className="shrink-0 text-graphite-400 hover:text-navy-700"
                onClick={() => { setAberto(true); setTermo(""); }}
                aria-label="Trocar pessoa"
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
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-graphite-400" />
          <input
            type="text"
            className="input pl-9"
            placeholder={placeholder ?? "Buscar por nome, funcao ou matricula"}
            disabled={disabled}
            value={termo}
            onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
          />
        </div>
      )}

      {aberto && !disabled && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">Buscando...</p>
          ) : opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">
              {buscaAplicada ? `Ninguem encontrado para "${buscaAplicada}".` : "Digite para buscar uma pessoa."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {opcoes.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => escolher(r.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{r.name}</span>
                      <span className="block truncate text-xs text-graphite-400">
                        {[r.type, r.registrationNumber].filter(Boolean).join(" - ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data && data.total > (data?.items ?? []).length && !excludeIds?.length && (
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
