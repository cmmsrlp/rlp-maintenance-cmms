import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "../../components/Modal";
import { TextInput, SelectInput, CheckboxInput } from "../../components/form/Field";
import { InstrumentPicker } from "../../components/InstrumentPicker";
import { AssetLevelInput } from "../../components/AssetLevelInput";
import { AssetTypeInput } from "../../components/AssetTypeInput";
import { LocationPicker } from "../../components/LocationPicker";
import { listAreas } from "../../api/areas";
import { areaComCentroDeCusto, centroDeCustoComDescricao } from "../../lib/centroDeCusto";
import { createInstrument, updateInstrument, getInstrument } from "../../api/instruments";
import type { Instrument } from "../../api/types";
import { useToast } from "../../components/Toast";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";

const schema = z.object({
  level: z.enum(["PLANT", "AREA", "MACHINE", "SUBASSEMBLY", "PART"]).optional().or(z.literal("")),
  type: z.string().optional(),
  tag: z.string().min(1, "Informe o TAG do ativo."),
  description: z.string().min(2, "Informe a descrição do ativo."),
  manufacturer: z.string().optional(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  installationLocation: z.string().optional(),
  calibratable: z.boolean().optional(),
  lubricatable: z.boolean().optional(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  operationalStatus: z.enum(["IN_OPERATION", "STOPPED", "STANDBY", "DEACTIVATED", "IN_MAINTENANCE"]).optional(),
  parentId: z.string().uuid().optional().or(z.literal("")),
  plantId: z.string().uuid().optional().or(z.literal("")),
  areaId: z.string().uuid().optional().or(z.literal("")),
}).superRefine((values, ctx) => {
  // Sem ativo pai, a area e' a unica fonte do centro de custo - deixar em branco aqui
  // deixaria o ativo (e tudo que nasce abaixo dele) sem rateio nenhum.
  if (!values.parentId && !values.areaId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Selecione a área.", path: ["areaId"] });
  }
});
type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (instrument: Instrument) => void;
  instrument?: Instrument;
  /** Pre-preenche o ativo pai quando aberto pelo "Adicionar componente" da ficha do pai. */
  initialParentId?: string;
  /** Sugestao de TAG (ex.: "F01-RMP-") a partir do TAG do pai - so um valor inicial, o campo continua livre pra editar/apagar. */
  initialTagPrefix?: string;
}

/** Cadastro de ativo pelo proprio cliente no portal - sem escolha de empresa (o backend
 * sempre grava para a empresa do usuario logado) e so com os campos essenciais. */
export function PortalInstrumentFormModal({ open, onClose, onSaved, instrument, initialParentId, initialTagPrefix }: Props) {
  const { notify } = useToast();
  const { user } = useAuth();
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  // O pai escolhido define o contexto herdado mostrado acima.
  const parentId = watch("parentId");
  // O tipo so aparece depois do nivel escolhido - e' ele que diz qual lista faz sentido.
  const nivel = watch("level") || undefined;
  const plantId = watch("plantId");
  const areaId = watch("areaId");

  // O centro de custo nao se escolhe no ativo: ele e' o padrao da area. Antes o formulario
  // perguntava e o backend descartava logo em seguida - a pessoa preenchia e depois nao
  // encontrava o que tinha escolhido.
  const { data: areasDaPlanta } = useQuery({
    queryKey: ["areas-centro-custo", plantId],
    queryFn: () => listAreas({ plantId: plantId as string, active: true }),
    enabled: !!plantId && !parentId,
  });
  const centroDaArea = (areasDaPlanta ?? []).find((a) => a.id === areaId)?.costCenter ?? null;
  const { data: pai } = useQuery({
    queryKey: ["instrument-parent-context", parentId],
    queryFn: () => getInstrument(parentId as string),
    enabled: !!parentId,
  });

  // Areas da planta do PAI - e' entre elas que um ativo do meio da arvore escolhe a sua.
  const { data: areasDaPlantaDoPai } = useQuery({
    queryKey: ["areas-do-pai", pai?.plantId],
    queryFn: () => listAreas({ plantId: pai?.plantId as string, active: true }),
    enabled: !!parentId && !!pai?.plantId,
  });


  useEffect(() => {
    if (open) {
      reset(
        instrument
          ? {
              level: instrument.level ?? "",
              type: instrument.type ?? "",
              tag: instrument.tag ?? "",
              description: instrument.description ?? "",
              manufacturer: instrument.manufacturer ?? "",
              model: instrument.model ?? "",
              serialNumber: instrument.serialNumber ?? "",
              installationLocation: instrument.installationLocation ?? "",
              calibratable: instrument.calibratable,
              lubricatable: instrument.lubricatable,
              criticality: instrument.criticality,
              operationalStatus: instrument.operationalStatus,
              parentId: instrument.parentId ?? "",
              plantId: instrument.plantId ?? "",
              areaId: instrument.areaId ?? "",
            }
          : { criticality: "MEDIUM", operationalStatus: "IN_OPERATION", parentId: initialParentId ?? "", tag: initialTagPrefix ?? "" },
      );
    }
  }, [open, instrument, initialParentId, initialTagPrefix, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const payload = {
        ...values,
        description: values.description || null,
        manufacturer: values.manufacturer || null,
        model: values.model || null,
        serialNumber: values.serialNumber || null,
        parentId: values.parentId || null,
        level: values.level || null,
        type: values.type || undefined,
        plantId: values.plantId || null,
        areaId: values.areaId || null,
      };
      const saved = instrument ? await updateInstrument(instrument.id, payload) : await createInstrument(payload);
      notify("success", instrument ? "Ativo atualizado." : "Ativo cadastrado.");
      onSaved(saved);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={instrument ? "Editar ativo" : "Novo ativo"}
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="portal-instrument-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form id="portal-instrument-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="TAG"
            required
            placeholder="Ex.: VTP-VOT-L4-CP01"
            hint="Código único deste ativo na sua empresa."
            error={errors.tag?.message}
            {...register("tag")}
          />
          <TextInput
            label="Descrição"
            placeholder="Ex.: Compressor de ar da Linha 4"
            hint="Nome do ativo em linguagem de gente."
            {...register("description")}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <AssetLevelInput
            error={errors.level?.message}
            {...register("level", {
              // Trocar o nivel muda a lista do campo seguinte: manter "Bomba" num ativo que
              // virou "Parte" deixaria a ficha dizendo uma coisa que a lista nao oferece.
              onChange: () => setValue("type", ""),
            })}
          />
          {/* Classe so faz sentido em equipamento (Maquina/Subconjunto/Parte) - Planta e
              Area sao nivel estrutural, nao tem "classe" pra escolher. */}
          {nivel && nivel !== "PLANT" && nivel !== "AREA" && (
            <AssetTypeInput nivel={nivel} currentValue={instrument?.type} {...register("type")} />
          )}
          <SelectInput
            label="Criticidade"
            hint="Quanto uma parada deste ativo pesa pra sua operação."
            options={[
              { value: "LOW", label: "Baixa" },
              { value: "MEDIUM", label: "Média" },
              { value: "HIGH", label: "Alta" },
              { value: "CRITICAL", label: "Crítica" },
            ]}
            {...register("criticality")}
          />
          <SelectInput
            label="Condição operacional"
            hint="O que está acontecendo com o ativo agora."
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

        {/* Planta, area e centro de custo sao definidos uma vez no ativo raiz e herdados por
            todo o galho abaixo. Num ativo filho eles nao se editam - antes o formulario
            pedia esses campos e o backend os descartava em seguida, substituindo pelo
            contexto do pai: o usuario preenchia e nao entendia por que mudava sozinho. */}
        {parentId ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-graphite-400">Onde fica</p>
            <p className="mt-0.5 text-xs text-graphite-500">
              A planta vem do ativo pai - um componente não muda de fábrica.
            </p>
            <p className="mt-2 text-sm">
              <span className="text-xs text-graphite-400">Planta: </span>
              <span className="font-medium text-graphite-800">{pai?.plant?.name ?? "-"}</span>
            </p>

            {/* A area NAO e' so do topo. A raiz costuma ser a planta inteira, que tem
                varias linhas: se o ativo que representa a linha nao pudesse dizer em que
                area fica, a arvore toda ficaria sem area - e portanto sem centro de custo,
                que e' exatamente o que aconteceu antes desta correcao. */}
            <div className="mt-3">
              <SelectInput
                label="Área / Centro de custo"
                placeholder={
                  pai?.area ? `Herdar do pai: ${areaComCentroDeCusto(pai.area, pai.costCenter)}` : "Herdar do pai (sem área definida)"
                }
                hint="Preencha no ativo que representa a linha/área. Tudo abaixo dele herda daqui, com o centro de custo junto."
                options={(areasDaPlantaDoPai ?? []).map((a) => ({
                  value: a.id,
                  label: areaComCentroDeCusto(a, a.costCenter),
                }))}
                {...register("areaId")}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-graphite-700">Onde fica</p>
            <p className="mt-0.5 text-xs text-graphite-500">
              Como este ativo não tem pai, é aqui que planta e área são definidas - todo ativo abaixo dele herda.
            </p>
            <div className="mt-3">
              <LocationPicker
                clientId={user?.clientId ?? undefined}
                register={register}
                watch={watch}
                setValue={setValue}
                hideCostCenter
                areaRequired
                areaError={errors.areaId?.message}
              />
            </div>
            {areaId && (
              <p className="mt-3 text-xs text-graphite-500">
                Centro de custo:{" "}
                <span className="font-medium text-graphite-800">
                  {centroDaArea ? centroDeCustoComDescricao(centroDaArea) : "a área escolhida ainda não tem um número"}
                </span>{" "}
                - vem junto da área, e todo ativo abaixo deste herda os dois.
              </p>
            )}
          </div>
        )}

        <InstrumentPicker
          label="Faz parte de (ativo pai)"
          hint="A estrutura é uma árvore: Planta > Linha > Máquina > Componente. Vazio = ativo no topo."
          excludeId={instrument?.id}
          error={errors.parentId?.message}
          {...register("parentId")}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Fabricante" {...register("manufacturer")} />
          <TextInput label="Modelo" {...register("model")} />
          <TextInput label="Número de série" {...register("serialNumber")} />
        </div>
        <TextInput label="Local de instalação" {...register("installationLocation")} />

        {/* As duas marcas que ligam este ativo aos outros dois modulos. A periodicidade de
            calibracao saiu daqui: era um numero solto na ficha, digitado uma vez e nunca
            mais olhado. Ela agora vive no plano de calibracao, que e' onde se decide o que
            sera feito e quando - a ficha so acompanha. */}
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-graphite-700">Este ativo participa de</p>
          <CheckboxInput
            label="Calibração - rastreia frequência e vencimento de calibração"
            {...register("calibratable")}
          />
          <p className="-mt-1 pl-6 text-xs text-graphite-500">
            Ao marcar, o ativo passa a rastrear calibração periódica. Depois é preciso criar o plano de
            calibração, que define de quanto em quanto tempo - a ficha lembra disso enquanto faltar.
          </p>
          <CheckboxInput
            label="Lubrificação - este ativo tem ponto de lubrificação"
            {...register("lubricatable")}
          />
          <p className="-mt-1 pl-6 text-xs text-graphite-500">
            Ao marcar, o ponto é cadastrado na ficha do ativo já com o ativo e o nome preenchidos, e passa a
            aparecer em Lubrificação.
          </p>
        </div>
      </form>
    </Modal>
  );
}
