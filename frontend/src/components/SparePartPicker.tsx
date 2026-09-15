import { forwardRef, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ChevronDown } from "lucide-react";
import { getSparePart, listSpareParts } from "../api/spareParts";

interface SparePartPickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  clientId?: string;
  /** Exclui esta peca das opcoes - usado no seletor de "Substituto aceito" para nao deixar
   * uma peca virar substituta dela mesma. */
  excludeId?: string;
  name: string;
  value?: string;
  // Assinaturas compativeis com o que o react-hook-form entrega em register().
  onChange?: (e: { target: { name: string; value: string } }) => unknown;
  onBlur?: (e: never) => unknown;
}

/**
 * Busca de peca do almoxarifado por nome, codigo ou categoria - digitando.
 *
 * Antes era um <select> com as 200 primeiras pecas (mesmo padrao ja corrigido no seletor
 * de ativo pai): num almoxarifado de alguns milhares de itens, a maioria simplesmente nao
 * aparecia, sem nenhum aviso. A busca vai ao servidor e traz so os itens que combinam com
 * o que foi digitado.
 */
export const SparePartPicker = forwardRef<HTMLInputElement, SparePartPickerProps>(function SparePartPicker(
  { label = "Peca", hint, error, required, className, placeholder, clientId, excludeId, name, value, onChange, onBlur },
  ref,
) {
  const escondido = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selecionadoId, setSelecionadoId] = useState("");

  // Uso controlado (useState comum, ex.: atalho de peca do BOM que preenche o campo por
  // fora): quando "value" e' passado, ele manda. Sem "value" (registro do react-hook-form,
  // que gerencia o input escondido direto no DOM), o polling abaixo continua cuidando disso.
  useEffect(() => {
    if (value !== undefined) setSelecionadoId(value);
  }, [value]);
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
    queryKey: ["spare-parts-busca", clientId ?? "own", buscaAplicada],
    queryFn: () => listSpareParts({ clientId, active: true, search: buscaAplicada || undefined, pageSize: 20 }),
    enabled: aberto,
  });

  // Ao editar, o valor ja vem preenchido: busca a peca so para mostrar de quem se trata.
  const { data: selecionado } = useQuery({
    queryKey: ["spare-part-selecionado", selecionadoId],
    queryFn: () => getSparePart(selecionadoId),
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

  const rotuloDoSelecionado = selecionado
    ? `${selecionado.name}${selecionado.code ? ` (${selecionado.code})` : ""}`
    : "";

  const opcoes = (data?.items ?? []).filter((p) => p.id !== excludeId);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-graphite-700">
          {label}
          {required && <span className="ml-0.5 text-safety-red">*</span>}
        </label>
      )}

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
            aria-label="Trocar peca"
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
            placeholder={placeholder ?? "Buscar por nome, código ou categoria"}
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
              {buscaAplicada ? `Nenhuma peça encontrada para "${buscaAplicada}".` : "Digite para buscar uma peça."}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {opcoes.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => escolher(p.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-navy-900">{p.name}</span>
                      <span className="block truncate text-xs text-graphite-400">
                        {[p.code, p.category].filter(Boolean).join(" - ") || "Sem código/categoria"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-graphite-400">{p.stockQty} {p.unit}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Sinaliza que a lista e' um recorte: sem isso o usuario acha que o almoxarifado
              so tem estes itens. */}
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
