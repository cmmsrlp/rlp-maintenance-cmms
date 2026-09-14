import { useEffect, useState } from "react";
import { areaComCentroDeCusto, centroDeCustoComDescricao } from "../../../lib/centroDeCusto";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Camera, X } from "lucide-react";
import { SecaoRecolhivel } from "../../../components/SecaoRecolhivel";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput, CheckboxInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { AssetTypeInput } from "../../../components/AssetTypeInput";
import { AssetLevelInput } from "../../../components/AssetLevelInput";
import { InstrumentPicker } from "../../../components/InstrumentPicker";
import { LocationPicker } from "../../../components/LocationPicker";
import { createInstrument, updateInstrument, getInstrument, uploadInstrumentPhoto, deleteInstrumentPhoto } from "../../../api/instruments";
import { listAreas } from "../../../api/areas";
import type { Instrument } from "../../../api/types";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/AuthContext";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";

const schema = z.object({
  clientId: z.string().uuid("Selecione o cliente."),
  tag: z.string().min(1, "Informe o TAG do ativo."),
  description: z.string().min(2, "Informe a descrição do ativo."),
  // O cadastro inicial nao pergunta o tipo - ele entra depois, na ficha do ativo.
  type: z.string().optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  operationalStatus: z.enum(["IN_OPERATION", "STOPPED", "STANDBY", "DEACTIVATED", "IN_MAINTENANCE"]).optional(),
  parentId: z.string().uuid().optional().or(z.literal("")),
  installationLocation: z.string().optional(),
  calibratable: z.boolean().optional(),
  costCenterId: z.string().uuid().optional().or(z.literal("")),
  level: z.enum(["PLANT", "AREA", "MACHINE", "SUBASSEMBLY", "PART"]).optional().or(z.literal("")),
  // Ficha do fabricante - opcional, fica recolhida.
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  // Calibracao - so para quem rastreia calibracao periodica deste ativo.
  measurementRange: z.string().optional(),
  resolution: z.string().optional(),
  unit: z.string().optional(),
  lubricatable: z.boolean().optional(),
  lastCalibrationDate: z.string().optional(),
  status: z.enum(["VALID", "DUE_SOON", "EXPIRED", "IN_MAINTENANCE"]).optional(),
  // Contexto so e' escolhido no ativo raiz (a planta). Nos filhos vem herdado do pai.
  plantId: z.string().uuid().optional().or(z.literal("")),
  areaId: z.string().uuid().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (instrument: Instrument) => void;
  instrument?: Instrument;
  /** Pre-preenche o ativo pai e o cliente quando aberto a partir de "Adicionar filho" na ficha do pai. */
  initialParentId?: string;
  initialClientId?: string;
  /** Sugestao de TAG (ex.: "F01-RMP-") a partir do TAG do pai - so um valor inicial, o campo continua livre pra editar/apagar. */
  initialTagPrefix?: string;
  /** Tipo sugerido para o filho (ex.: pai e' Linha -> sugere Maquina). */
  initialType?: string;
}

export function InstrumentFormModal({ open, onClose, onSaved, instrument, initialParentId, initialClientId, initialTagPrefix, initialType }: Props) {
  const { notify } = useToast();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });
  const { user } = useAuth();
  const clientId = watch("clientId");
  const parentId = watch("parentId");
  // O status do certificado so faz sentido em ativo que de fato e' calibrado.
  const tracksCalibration = !!watch("calibratable");

  // Cadastro novo e' o caminho rapido: so o que identifica o ativo e onde ele fica. A ficha
  // completa (tipo, criticidade, fabricante, calibracao) aparece ao editar - assim ninguem
  // precisa saber tudo sobre o equipamento para conseguir cadastra-lo.
  const modoRapido = !instrument;

  const [foto, setFoto] = useState<File | null>(null);
  const [fotoRemovida, setFotoRemovida] = useState(false);
  const previewFoto = foto ? URL.createObjectURL(foto) : fotoRemovida ? null : instrument?.photoUrl ?? null;

  const plantId = watch("plantId");
  const areaId = watch("areaId");
  const { data: areasDaPlanta } = useQuery({
    queryKey: ["areas-centro-custo", plantId],
    queryFn: () => listAreas({ plantId: plantId as string, active: true }),
    enabled: !!plantId && !parentId,
  });
  const centroDaArea = (areasDaPlanta ?? []).find((a) => a.id === areaId)?.costCenter ?? null;
  const centroDeCustoDaArea = centroDaArea ? centroDeCustoComDescricao(centroDaArea) : null;

  // O nivel e' escolhido direto, nao mais deduzido do nome do tipo.
  const level = watch("level") || null;
  const isRoot = level === "PLANT";

  // Contexto herdado do pai - so leitura, o filho nao redefine planta/area/centro de custo.
  const { data: parent } = useQuery({
    queryKey: ["instrument-parent-context", parentId],
    queryFn: () => getInstrument(parentId as string),
    enabled: !!parentId,
  });

  useEffect(() => {
    if (open) {
      setFoto(null);
      setFotoRemovida(false);
      reset(
        instrument
          ? {
              clientId: instrument.clientId,
              tag: instrument.tag ?? "",
              description: instrument.description ?? "",
              type: instrument.type,
              criticality: instrument.criticality,
              operationalStatus: instrument.operationalStatus,
              parentId: instrument.parentId ?? "",
              installationLocation: instrument.installationLocation ?? "",
              calibratable: instrument.calibratable,
              lubricatable: instrument.lubricatable,
              costCenterId: instrument.costCenterId ?? "",
              level: instrument.level ?? "",
              manufacturer: instrument.manufacturer ?? "",
              model: instrument.model ?? "",
              serialNumber: instrument.serialNumber ?? "",
              measurementRange: instrument.measurementRange ?? "",
              resolution: instrument.resolution ?? "",
              unit: instrument.unit ?? "",
              lastCalibrationDate: instrument.lastCalibrationDate?.slice(0, 10) ?? "",
              status: instrument.status,
              plantId: instrument.plantId ?? "",
              areaId: instrument.areaId ?? "",
            }
          : {
              criticality: "MEDIUM",
              operationalStatus: "IN_OPERATION",
              parentId: initialParentId ?? "",
              clientId: initialClientId ?? "",
              tag: initialTagPrefix ?? "",
              type: initialType ?? "",
            },
      );
    }
  }, [open, instrument, initialParentId, initialClientId, initialTagPrefix, initialType, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        description: values.description || null,
        manufacturer: values.manufacturer || null,
        model: values.model || null,
        serialNumber: values.serialNumber || null,
        parentId: values.parentId || null,
        plantId: values.plantId || null,
        areaId: values.areaId || null,
        costCenterId: values.costCenterId || null,
        level: values.level || null,
      };
      let saved = instrument ? await updateInstrument(instrument.id, payload) : await createInstrument(payload);

      // A foto so pode subir depois que o ativo existe - e' ela que da o id do arquivo.
      if (foto) saved = await uploadInstrumentPhoto(saved.id, foto);
      else if (fotoRemovida && instrument?.photoUrl) await deleteInstrumentPhoto(saved.id);

      notify("success", instrument ? "Ativo atualizado." : "Ativo cadastrado. Complete a ficha técnica quando quiser.");
      onSaved(saved);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={instrument ? "Editar ativo" : "Novo ativo"} size="lg" footer={
      <>
        <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
        <button type="submit" form="instrument-form" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </button>
      </>
    }>
      <form id="instrument-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <ClientPicker required error={errors.clientId?.message} {...register("clientId")} />

        {/* O essencial: como este ativo se chama e onde ele entra na arvore. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="TAG"
            required
            placeholder="Ex.: VTP-VOT-L4-CP01"
            hint="Código único do ativo dentro da empresa."
            error={errors.tag?.message}
            {...register("tag")}
          />
          <TextInput
            label="Descrição"
            placeholder="Ex.: Compressor de ar da Linha 4"
            hint="Nome do ativo em linguagem de gente."
            error={errors.description?.message}
            {...register("description")}
          />
        </div>

        {/* Foto: opcional, mas e' o que faz a lista de ativos deixar de ser uma tabela de
            codigos e virar algo que a equipe reconhece de relance. */}
        <div className="flex items-center gap-4">
          {previewFoto ? (
            <img src={previewFoto} alt="Foto do ativo" className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover" />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50">
              <Camera className="h-6 w-6 text-graphite-300" />
            </div>
          )}
          <div className="min-w-0">
            <label className="btn-outline inline-flex cursor-pointer items-center gap-2 text-sm">
              <Camera className="h-4 w-4" />
              {previewFoto ? "Trocar foto" : "Adicionar foto"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0] ?? null;
                  setFoto(arquivo);
                  if (arquivo) setFotoRemovida(false);
                }}
              />
            </label>
            {previewFoto && (
              <button
                type="button"
                className="ml-2 inline-flex items-center gap-1 text-xs text-graphite-500 hover:text-safety-red"
                onClick={() => { setFoto(null); setFotoRemovida(true); }}
              >
                <X className="h-3 w-3" /> Remover
              </button>
            )}
            <p className="mt-1 text-xs text-graphite-400">Opcional. Uma foto do equipamento ajuda a reconhecer o ativo na lista.</p>
          </div>
        </div>

        <InstrumentPicker
          label="Faz parte de (ativo pai)"
          required={!modoRapido && !isRoot}
          hint="Estrutura: Planta > Área > Ativo/Sistema > Equipamento > Componente. Vazio = ativo no topo."
          clientId={clientId}
          excludeId={instrument?.id}
          error={errors.parentId?.message}
          {...register("parentId")}
        />

        {parentId && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-graphite-400">Contexto herdado</p>
            <p className="mt-0.5 text-xs text-graphite-500">
              Vem do ativo pai e do centro de custo padrão da área - não se edita aqui.
            </p>
            <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-graphite-400">Planta</dt>
                <dd className="font-medium text-graphite-800">{parent?.plant?.name ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-graphite-400">Área / Centro de custo</dt>
                <dd className="font-medium text-graphite-800">{areaComCentroDeCusto(parent?.area, parent?.costCenter)}</dd>
              </div>
            </dl>
          </div>
        )}

        {!modoRapido && (
        <>
        <div className="grid gap-4 sm:grid-cols-3">
          <AssetLevelInput
            error={errors.level?.message}
            {...register("level", { onChange: () => setValue("type", "") })}
          />
          {level && <AssetTypeInput nivel={level} currentValue={instrument?.type} error={errors.type?.message} {...register("type")} />}
          <SelectInput
            label="Criticidade"
            hint="Quanto uma parada pesa pra empresa."
            options={[
              { value: "LOW", label: "Baixa" },
              { value: "MEDIUM", label: "Média" },
              { value: "HIGH", label: "Alta" },
              { value: "CRITICAL", label: "Crítica" },
            ]}
            {...register("criticality")}
          />
          <SelectInput
            label="Condição"
            options={[
              { value: "IN_OPERATION", label: "Em operação" },
              { value: "STOPPED", label: "Parado" },
              { value: "STANDBY", label: "Reserva" },
              { value: "DEACTIVATED", label: "Desativado" },
              { value: "IN_MAINTENANCE", label: "Em manutenção" },
            ]}
            {...register("operationalStatus")}
          />
        </div>

        <SecaoRecolhivel titulo="Ficha do fabricante" dica="opcional">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Fabricante" {...register("manufacturer")} />
            <TextInput label="Modelo" {...register("model")} />
            <TextInput label="Número de série" {...register("serialNumber")} />
          </div>
          <TextInput label="Ponto de instalação" placeholder="Ex.: Casa de máquinas, painel 3" {...register("installationLocation")} />
        </SecaoRecolhivel>

        <SecaoRecolhivel titulo="Calibração e lubrificação" dica="a que este ativo está sujeito">
          <CheckboxInput
            label="Ativo calibrável - rastreia frequência e vencimento de calibração"
            {...register("calibratable")}
          />
          <p className="text-xs text-graphite-500">
            Marque so equipamentos que passam por calibracao periodica rastreada. De quanto em quanto tempo
            calibrar e' definido no plano de manutencao deste ativo, nao aqui.
          </p>
          <CheckboxInput
            label="Ativo lubrificável - tem ponto de lubrificação"
            {...register("lubricatable")}
          />
          <p className="text-xs text-graphite-500">
            Ao marcar, a ficha do ativo passa a cobrar o cadastro do ponto (lubrificante, quantidade, método e
            periodicidade), que entra em Lubrificação já ligado a este ativo.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Última calibração" type="date" {...register("lastCalibrationDate")} />
            {instrument && tracksCalibration && (
              <SelectInput
                label="Status do certificado"
                options={[
                  { value: "VALID", label: "Válido" },
                  { value: "DUE_SOON", label: "Próximo do vencimento" },
                  { value: "EXPIRED", label: "Vencido" },
                  { value: "IN_MAINTENANCE", label: "Em manutenção" },
                ]}
                {...register("status")}
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextInput label="Faixa de medição" {...register("measurementRange")} />
            <TextInput label="Resolução" {...register("resolution")} />
            <TextInput label="Unidade" {...register("unit")} />
          </div>
        </SecaoRecolhivel>
        </>
        )}

        {!parentId && (
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-medium text-graphite-700">Onde fica</p>
            <p className="mt-0.5 text-xs text-graphite-500">
              Sem ativo pai, é aqui que a planta e a área são definidas - e todo ativo abaixo deste na árvore
              herda esse contexto.
            </p>
            <div className="mt-3">
              <LocationPicker clientId={clientId} register={register} watch={watch} setValue={setValue} hideCostCenter />
            </div>
            {areaId && (
              <p className="mt-3 text-xs text-graphite-500">
                Centro de custo: <span className="font-medium text-graphite-800">{centroDeCustoDaArea ?? "a área escolhida ainda não tem um número"}</span>
                {" "}- vem da área, não se digita aqui.
              </p>
            )}
          </div>
        )}

        {user?.role === "ADMIN" && !modoRapido && (
          <SecaoRecolhivel titulo="Exceção de centro de custo" dica="somente administrador">
            <p className="text-xs text-graphite-500">
              Por padrão o centro de custo vem da área. Preencha aqui apenas se este ativo específico precisa
              ser rateado em outro centro de custo - a herança deixa de sobrescrever este ativo.
            </p>
            <LocationPicker clientId={clientId} register={register} watch={watch} setValue={setValue} onlyCostCenter />
          </SecaoRecolhivel>
        )}
        {/* A unica coisa que o cadastro rapido pergunta alem do essencial, e so para a
            equipe interna: se este ativo rastreia calibracao periodica. O cliente nao ve -
            o que ele cadastra e' o parque dele. */}
        {modoRapido && user?.role !== "CLIENT" && (
          <CheckboxInput
            label="Ativo calibrável - rastreia frequência e vencimento de calibração"
            {...register("calibratable")}
          />
        )}

        {modoRapido && (
          <p className="rounded-lg bg-gray-50 px-4 py-3 text-xs text-graphite-500">
            Tipo do ativo, criticidade, ficha do fabricante e calibracao sao preenchidos depois, na ficha
            deste ativo. Para cadastrar, basta o que esta acima.
          </p>
        )}
      </form>
    </Modal>
  );
}
