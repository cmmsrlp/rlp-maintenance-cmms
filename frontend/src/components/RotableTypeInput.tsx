import { forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAssetTypes } from "../api/assetTypes";
import { SelectInput } from "./form/Field";

interface Props extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  error?: string;
  required?: boolean;
  name: string;
  clientId?: string;
  /** Valor atual do equipamento sendo editado - se nao estiver mais no catalogo ativo,
   * entra como opcao extra pra nao trocar o tipo silenciosamente so por abrir a edicao. */
  currentValue?: string | null;
}

/**
 * Tipo do equipamento recondicionavel (Motor, Redutor, Rolo...), reaproveitando o mesmo
 * catalogo de Tipos de ativo usado nos Ativos - mas sem o filtro por nivel de hierarquia
 * (AssetTypeInput), ja que um equipamento recondicionavel nao tem posicao na arvore de
 * ativos, so' um tipo.
 */
export const RotableTypeInput = forwardRef<HTMLSelectElement, Props>(function RotableTypeInput(
  { label, clientId, currentValue, ...rest },
  ref,
) {
  const { data: types } = useQuery({
    queryKey: ["asset-types-picker", clientId],
    queryFn: () => listAssetTypes({ active: true, clientId }),
    staleTime: 60_000,
  });

  const options = (types ?? []).map((t) => ({ value: t.name, label: t.name }));

  if (currentValue && !options.some((o) => o.value === currentValue)) {
    options.unshift({ value: currentValue, label: `${currentValue} (fora do catalogo)` });
  }

  return (
    <SelectInput
      ref={ref}
      label={label ?? "Tipo"}
      placeholder="Selecione o tipo"
      hint="Novos tipos em Ativos > Cadastros tecnicos > Tipos de ativo."
      options={options}
      {...rest}
    />
  );
});
