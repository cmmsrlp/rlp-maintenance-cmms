import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormWatch, UseFormSetValue, FieldValues, Path } from "react-hook-form";
import { listPlants } from "../api/plants";
import { listAreas } from "../api/areas";
import { listCostCenters } from "../api/costCenters";
import { SelectInput } from "./form/Field";
import { centroDeCustoComDescricao } from "../lib/centroDeCusto";

interface Props<T extends FieldValues> {
  clientId?: string;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  /** So o centro de custo (classificacao contabil) - usado quando planta/area/sistema
   * ficam em outra secao do formulario. */
  onlyCostCenter?: boolean;
  /** Planta/area/sistema sem o centro de custo, que aparece em outro lugar. */
  hideCostCenter?: boolean;
  /** Area obrigatoria - so faz sentido no ativo raiz, onde ela nao vem herdada de ninguem. */
  areaRequired?: boolean;
  areaError?: string;
}

/** Planta -> Area em cascata + Centro de custo - o contexto do ativo RAIZ, de onde todo o
 * galho abaixo herda. Reaproveitado no formulario de ativo da gestao e do portal (mesmos
 * nomes de campo: plantId/areaId/costCenterId). Trocar a planta limpa a area escolhida,
 * que pertencia a planta anterior.
 *
 * "Sistema" saiu daqui: ele repetia um nivel da propria arvore de ativos (Linha > Sistema >
 * Equipamento), entao a mesma informacao existia em dois lugares que podiam divergir. A
 * arvore e' a verdade tecnica. */
export function LocationPicker<T extends FieldValues>({ clientId, register, watch, setValue, onlyCostCenter, hideCostCenter, areaRequired, areaError }: Props<T>) {
  const plantId = watch("plantId" as Path<T>) as string | undefined;

  const { data: plants } = useQuery({
    queryKey: ["plants-picker", clientId],
    queryFn: () => listPlants({ clientId, active: true }),
    enabled: !!clientId,
  });
  const { data: areas } = useQuery({
    queryKey: ["areas-picker", plantId],
    queryFn: () => listAreas({ plantId, active: true }),
    enabled: !!plantId,
  });
  const { data: costCenters } = useQuery({
    queryKey: ["cost-centers-picker", clientId],
    queryFn: () => listCostCenters({ clientId, active: true }),
    enabled: !!clientId,
  });

  const costCenterField = (
    <SelectInput
      label="Centro de custo"
      placeholder="Nenhum"
      options={(costCenters ?? []).map((c) => ({ value: c.id, label: centroDeCustoComDescricao(c) }))}
      {...register("costCenterId" as Path<T>)}
    />
  );

  if (onlyCostCenter) return costCenterField;

  return (
    <div className={`grid gap-4 sm:grid-cols-2 ${hideCostCenter ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
      <SelectInput
        label="Planta"
        placeholder="Nenhuma"
        options={(plants ?? []).map((p) => ({ value: p.id, label: p.name }))}
        {...register("plantId" as Path<T>, {
          onChange: () => setValue("areaId" as Path<T>, "" as never),
        })}
      />
      <SelectInput
        label="Area / Centro de custo"
        required={areaRequired}
        error={areaError}
        placeholder={plantId ? "Nenhuma" : "Selecione a planta primeiro"}
        hint="O centro de custo vem junto da area escolhida."
        options={(areas ?? []).map((a) => ({ value: a.id, label: a.name }))}
        disabled={!plantId}
        {...register("areaId" as Path<T>)}
      />
      {!hideCostCenter && costCenterField}
    </div>
  );
}
