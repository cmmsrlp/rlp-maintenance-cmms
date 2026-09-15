import { SimpleCatalogList } from "../../../components/SimpleCatalogList";
import { listPlants, createPlant, updatePlant, deletePlant } from "../../../api/plants";
import { useCmms } from "../../../lib/cmms";

export default function PlantsList() {
  const { assetsBase } = useCmms();
  return (
    <SimpleCatalogList
      title="Plantas"
      description="Unidades/fábricas da empresa - primeiro nível da localização do ativo"
      itemLabel="Planta"
      namePlaceholder="Ex.: Fábrica Unidade Belo Horizonte"
      breadcrumbs={[{ label: "Ativos", to: assetsBase }, { label: "Cadastros técnicos", to: `${assetsBase}/cadastros` }, { label: "Plantas" }]}
      base="plants"
      list={listPlants}
      create={createPlant}
      update={updatePlant}
      del={deletePlant}
    />
  );
}
