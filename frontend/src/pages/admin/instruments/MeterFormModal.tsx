import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { numeroOpcional } from "../../../lib/zodHelpers";
import { createMeter } from "../../../api/meters";
import type { Meter } from "../../../api/types";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";

const OPCOES_DE_TECNICA = [
  { value: "COUNTER", label: "Contador (horimetro, odometro, ciclos)" },
  { value: "VIBRATION", label: "Vibracao" },
  { value: "THERMOGRAPHY", label: "Termografia" },
  { value: "OIL_ANALYSIS", label: "Analise de oleo" },
  { value: "ULTRASOUND", label: "Ultrassom" },
  { value: "MOTOR_CURRENT", label: "Corrente do motor" },
  { value: "VISUAL", label: "Inspecao visual" },
  { value: "OTHER", label: "Outra" },
];

const OPCOES_DE_DIRECAO = [
  { value: "RANGE", label: "Fora da faixa min/max e' ruim (contador, variavel de processo)" },
  { value: "UPPER", label: "Quanto maior, pior (vibracao, temperatura, dB)" },
  { value: "LOWER", label: "Quanto menor, pior (pressao, espessura, isolamento)" },
];

const schema = z
  .object({
    name: z.string().min(1, "Informe o nome do medidor."),
    unit: z.string().min(1, "Informe a unidade."),
    currentValue: z.coerce.number().nonnegative().optional(),
    technique: z.enum(["COUNTER", "VIBRATION", "THERMOGRAPHY", "OIL_ANALYSIS", "ULTRASOUND", "MOTOR_CURRENT", "VISUAL", "OTHER"]),
    direction: z.enum(["UPPER", "LOWER", "RANGE"]),
    minThreshold: numeroOpcional(z.coerce.number()),
    maxThreshold: numeroOpcional(z.coerce.number()),
    warningLimit: numeroOpcional(z.coerce.number()),
    criticalLimit: numeroOpcional(z.coerce.number()),
    criterion: z.string().optional(),
    frequencyDays: numeroOpcional(z.coerce.number().int().positive()),
  })
  .refine((v) => v.minThreshold == null || v.maxThreshold == null || v.minThreshold <= v.maxThreshold, {
    message: "O limite minimo nao pode ser maior que o maximo.",
    path: ["maxThreshold"],
  });
type FormValues = z.infer<typeof schema>;

/**
 * Tecnica e direcao ficavam de fora do formulario, entao todo medidor nascia como
 * COUNTER/RANGE (os defaults do banco) - e o painel de Preditiva exclui de proposito
 * medidor COUNTER (ele mede uso, nao condicao), entao nenhum medidor cadastrado por aqui
 * jamais aparecia la, nem dava pra configurar as zonas de Alerta/Alarme/Critico que a
 * propria tela de Preditiva promete (achado na varredura desta rodada). Ganharam campo os
 * dois, mais os limites de alerta/critico e o criterio tecnico (ex.: "ISO 10816-3 Classe II").
 */
export function MeterFormModal({
  open,
  onClose,
  onSaved,
  instrumentId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (meter: Meter) => void;
  instrumentId: string;
}) {
  const { notify } = useToast();
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const tecnica = watch("technique");
  const ehContador = tecnica === "COUNTER";

  useEffect(() => {
    if (open) {
      reset({
        name: "",
        unit: "",
        currentValue: 0,
        technique: "COUNTER",
        direction: "RANGE",
        minThreshold: undefined,
        maxThreshold: undefined,
        warningLimit: undefined,
        criticalLimit: undefined,
        criterion: "",
        frequencyDays: undefined,
      });
    }
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const meter = await createMeter({
        ...values,
        instrumentId,
        minThreshold: values.minThreshold ?? null,
        maxThreshold: values.maxThreshold ?? null,
        warningLimit: values.warningLimit ?? null,
        criticalLimit: values.criticalLimit ?? null,
        criterion: values.criterion || null,
        frequencyDays: values.frequencyDays ?? null,
      });
      notify("success", "Medidor cadastrado.");
      onSaved(meter);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo medidor"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
          <button type="submit" form="meter-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar"}
          </button>
        </>
      }
    >
      <form id="meter-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextInput label="Nome" required placeholder="Ex.: Horimetro, Vibracao do mancal" error={errors.name?.message} {...register("name")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Unidade" required placeholder="Ex.: h, km, ciclos, mm/s, °C" error={errors.unit?.message} {...register("unit")} />
          <TextInput label="Leitura atual" type="number" step="any" {...register("currentValue")} />
        </div>
        <SelectInput
          label="Tecnica"
          hint="COUNTER (contador) alimenta plano por uso, mas nao entra no painel de condicao - so as outras tecnicas viram Preditiva de verdade."
          options={OPCOES_DE_TECNICA}
          {...register("technique")}
        />
        {!ehContador && (
          <>
            <SelectInput label="Direcao da leitura" options={OPCOES_DE_DIRECAO} {...register("direction")} />
            <div className="rounded-lg border border-navy-200 bg-navy-50 p-4 space-y-3">
              <p className="text-xs text-graphite-600">
                Zonas de severidade, da mais branda a mais grave. So a zona Alarme (ou Critico) abre OS sozinha; Alerta so acende no painel.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput label="Alerta (aviso antecipado)" type="number" step="any" {...register("warningLimit")} />
                <TextInput label="Critico" type="number" step="any" {...register("criticalLimit")} />
              </div>
            </div>
            <TextInput label="Criterio tecnico (opcional)" placeholder='Ex.: "ISO 10816-3 Classe II"' {...register("criterion")} />
            <TextInput label="Frequencia de coleta (dias, opcional)" type="number" hint="O painel acusa coleta atrasada quando passar desse prazo." {...register("frequencyDays")} />
          </>
        )}
        <div className="rounded-lg border border-navy-200 bg-navy-50 p-4">
          <p className="mb-3 text-xs text-graphite-600">
            {ehContador
              ? "Faixa normal de operacao (opcional). Uma leitura fora dela abre sozinha uma OS de manutencao preditiva."
              : "Limite de alarme (zona ALARME - a leitura ultrapassou a faixa historica, mas ainda nao chegou no limite Critico acima)."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Limite minimo" type="number" step="any" error={errors.minThreshold?.message} {...register("minThreshold")} />
            <TextInput label="Limite maximo" type="number" step="any" error={errors.maxThreshold?.message} {...register("maxThreshold")} />
          </div>
        </div>
      </form>
    </Modal>
  );
}
