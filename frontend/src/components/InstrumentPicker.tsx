import { forwardRef, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, ChevronDown } from "lucide-react";
import { getInstrument, listInstruments } from "../api/instruments";
import { useCmms } from "../lib/cmms";

interface InstrumentPickerProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  clientId?: string;
  /** Exclui este ativo das opcoes - usado no seletor de "Ativo pai" para nao deixar
   * um ativo apontar para si mesmo. */
  excludeId?: string;
  /** Restringe a busca aos ativos de uma area. Sem area escolhida, o seletor fica
   * bloqueado: escolher o ativo antes da area deixaria a lista enorme e desconexa. */
  areaId?: string;
  /** Texto quando ainda falta escolher a area. */
  bloqueadoMsg?: string;
  name: string;
  value?: string;
  // Assinaturas compativeis com o que o react-hook-form entrega em register().
  onChange?: (e: { target: { name: string; value: string } }) => unknown;
  onBlur?: (e: never) => unknown;
}

/**
 * Busca de ativo por TAG, descricao, modelo ou numero de serie - digitando.
 *
 * Antes era um <select> com os 200 primeiros ativos: numa empresa com mil ativos os
 * outros oitocentos simplesmente nao existiam na tela, e nao havia como saber disso. A
 * busca vai ao servidor (que ja filtra por empresa e por TAG/descricao/modelo/serie) e
 * traz os 20 mais proximos do que se digitou.
 */
export const InstrumentPicker = forwardRef<HTMLInputElement, InstrumentPickerProps>(function InstrumentPicker(
  { label = "Ativo", hint, error, required, clientId, excludeId, areaId, bloqueadoMsg, name, onChange, onBlur },
  ref,
) {
  // No portal o backend ja restringe a lista a empresa do usuario, entao nao ha
  // (nem faz sentido pedir) um clientId para liberar o seletor.
  const { isClient } = useCmms();
  const pronto = (isClient || !!clientId) && (bloqueadoMsg === undefined || !!areaId);

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
    queryKey: ["instruments-busca", clientId ?? "own", areaId ?? "todas", buscaAplicada],
    queryFn: () => listInstruments({ clientId, areaId: areaId || undefined, search: buscaAplicada || undefined, scope: "cmms", pageSize: 20 }),
    enabled: pronto && aberto,
  });

  // O ativo pode estar cadastrado numa area diferente da escolhida (denominacao errada,
  // reclassificacao pendente etc.) - sem isso a solicitacao "nasce sem ativo e perde
  // rastreabilidade" (achado em reavaliacao: TAG exato digitado em Corte 1 nao encontrava
  // um ativo que existe, so' que fora dessa area). So dispara quando a busca com area deu
  // zero resultado, pra nao gastar outra consulta em toda digitada.
  const buscaSemArea = !!areaId && !!buscaAplicada && !isFetching && (data?.items?.length ?? 0) === 0;
  const { data: dataForaDaArea } = useQuery({
    queryKey: ["instruments-busca-fora-area", clientId ?? "own", buscaAplicada],
    queryFn: () => listInstruments({ clientId, search: buscaAplicada, scope: "cmms", pageSize: 5 }),
    enabled: pronto && aberto && buscaSemArea,
  });
  const opcoesForaDaArea = (dataForaDaArea?.items ?? []).filter((i) => i.id !== excludeId);

  // Ao editar, o valor ja vem preenchido: busca a ficha so para mostrar de quem se trata.
  const { data: selecionado } = useQuery({
    queryKey: ["instrument-selecionado", selecionadoId],
    queryFn: () => getInstrument(selecionadoId),
    enabled: !!selecionadoId,
  });

  /** O valor tambem chega de fora: o formulario faz reset ao carregar uma OS existente e
   * escreve direto na propriedade .value do input escondido, o que nao dispara evento
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
    ? [selecionado.tag ?? selecionado.type, selecionado.description || selecionado.model].filter(Boolean).join(" - ")
    : "";

  const opcoes = (data?.items ?? []).filter((i) => i.id !== excludeId);

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
          {selecionado?.photoUrl && (
            <img src={selecionado.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-gray-200 object-cover" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm text-graphite-800">
            {rotuloDoSelecionado || "Carregando..."}
          </span>
          <button
            type="button"
            className="shrink-0 text-graphite-400 hover:text-navy-700"
            onClick={() => { setAberto(true); setTermo(""); }}
            aria-label="Trocar ativo"
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
            placeholder={
              pronto
                ? "Buscar por TAG, descrição, modelo ou número de série"
                : (bloqueadoMsg ?? "Selecione o cliente primeiro")
            }
            disabled={!pronto}
            value={termo}
            onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
            onFocus={() => setAberto(true)}
          />
        </div>
      )}

      {aberto && pronto && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {isFetching && opcoes.length === 0 ? (
            <p className="px-3 py-2 text-sm text-graphite-500">Buscando...</p>
          ) : opcoes.length === 0 ? (
            <>
              <p className="px-3 py-2 text-sm text-graphite-500">
                {buscaAplicada ? `Nenhum ativo encontrado para "${buscaAplicada}" nesta área.` : "Digite para buscar um ativo."}
              </p>
              {opcoesForaDaArea.length > 0 && (
                <div className="border-t border-gray-100">
                  <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-graphite-400">Encontrado fora desta area</p>
                  <ul className="divide-y divide-gray-100">
                    {opcoesForaDaArea.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                          onClick={() => escolher(i.id)}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-navy-900">{i.tag ?? i.type}</span>
                            <span className="block truncate text-xs text-graphite-400">
                              {[i.description || i.model, i.area?.name, i.plant?.name].filter(Boolean).join(" - ") || i.type}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <ul className="divide-y divide-gray-100">
              {opcoes.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50"
                    onClick={() => escolher(i.id)}
                  >
                    {i.photoUrl && (
                      <img src={i.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-gray-200 object-cover" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-900">{i.tag ?? i.type}</span>
                      <span className="block truncate text-xs text-graphite-400">
                        {[i.description || i.model, i.area?.name, i.plant?.name].filter(Boolean).join(" - ") || i.type}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Sinaliza que a lista e' um recorte: sem isso o usuario acha que a empresa so
              tem estes ativos. */}
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
