import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAssetTypes } from "../api/assetTypes";
import { SelectInput } from "./form/Field";
import { ASSET_LEVEL_LABELS } from "../lib/assetHierarchy";
import type { AssetHierarchyLevel } from "../api/types";

interface Props {
  label?: string;
  error?: string;
  required?: boolean;
  name: string;
  /** Nivel ja escolhido - a lista mostra so os tipos que fazem sentido nele. */
  nivel: AssetHierarchyLevel;
  /** Valor atual do ativo sendo editado - se nao estiver mais no catalogo ativo (tipo
   * desativado, ou cadastrado antes desta lista existir), entra como opcao extra pra nao
   * trocar o tipo do ativo silenciosamente so por abrir o formulario de edicao. */
  currentValue?: string | null;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLSelectElement>) => void;
}

/**
 * Que equipamento e' este, dentro do nivel ja escolhido: uma Maquina pode ser Bomba,
 * Compressor, Motor eletrico...; um Subconjunto pode ser Redutor ou Valvula.
 *
 * Este campo so aparece depois do nivel. Antes ele era a primeira e unica escolha, numa
 * lista corrida de dezenas de nomes onde "Planta" e "Bomba" apareciam lado a lado e nada
 * dizia que era essa escolha que definia o nivel do ativo.
 */
export const AssetTypeInput = forwardRef<HTMLSelectElement, Props>(function AssetTypeInput(
  { label, nivel, currentValue, ...rest },
  ref,
) {
  const { data: types } = useQuery({
    queryKey: ["asset-types-picker"],
    queryFn: () => listAssetTypes({ active: true }),
    staleTime: 60_000,
  });

  const options = (types ?? [])
    .filter((t) => t.level === nivel)
    .map((t) => ({ value: t.name, label: t.name }));

  // O rotulo do nivel ("Maquina", "Parte") e' o que fica gravado quando ninguem escolhe um
  // tipo especifico - nao e' um tipo do catalogo, entao nao vale como opcao extra aqui.
  const rotuloDoNivel = ASSET_LEVEL_LABELS[nivel];
  if (currentValue && currentValue !== rotuloDoNivel && !options.some((o) => o.value === currentValue)) {
    options.unshift({ value: currentValue, label: `${currentValue} (fora da lista deste nível)` });
  }

  return (
    <SelectInput
      ref={ref}
      label={label ?? `Classe de ${rotuloDoNivel.toLowerCase()}`}
      placeholder="Não especificar"
      hint="Opcional. Novas classes em Cadastros > Classes de ativo."
      options={options}
      {...rest}
    />
  );
});
