import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput, TextareaInput, CheckboxInput } from "../../../components/form/Field";
import { createClient, updateClient } from "../../../api/clients";
import { listPlans } from "../../../api/plans";
import type { Client } from "../../../api/types";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";

const schema = z.object({
  companyName: z.string().min(2, "Informe a razão social."),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  stateRegistration: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressDistrict: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZip: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  technicalContactName: z.string().optional(),
  commercialContactName: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PROSPECT"]),
  // Unico servico que este produto oferece - o enum ServiceCategory ainda tem os valores
  // antigos da OptiProcess (calibracao, laudo...) por compatibilidade de banco, mas nada
  // aqui deixa a equipe escolher entre eles: so existe CMMS.
  usaCmms: z.boolean().optional(),
  planId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface ClientFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (client: Client) => void;
  client?: Client;
}

export function ClientFormModal({ open, onClose, onSaved, client }: ClientFormModalProps) {
  const { notify } = useToast();
  const { data: plans } = useQuery({ queryKey: ["plans-picker"], queryFn: () => listPlans({ active: true }), enabled: open, staleTime: 60_000 });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: "PROSPECT", usaCmms: true },
  });

  useEffect(() => {
    if (open) {
      reset(
        client
          ? {
              companyName: client.companyName,
              tradeName: client.tradeName ?? "",
              cnpj: client.cnpj ?? "",
              stateRegistration: client.stateRegistration ?? "",
              addressStreet: client.addressStreet ?? "",
              addressNumber: client.addressNumber ?? "",
              addressDistrict: client.addressDistrict ?? "",
              addressCity: client.addressCity ?? "",
              addressState: client.addressState ?? "",
              addressZip: client.addressZip ?? "",
              phone: client.phone ?? "",
              whatsapp: client.whatsapp ?? "",
              email: client.email ?? "",
              technicalContactName: client.technicalContactName ?? "",
              commercialContactName: client.commercialContactName ?? "",
              status: client.status,
              usaCmms: (client.contractedServices ?? []).includes("CMMS_MAINTENANCE"),
              planId: client.planId ?? "",
              notes: client.notes ?? "",
            }
          : { status: "PROSPECT", usaCmms: true },
      );
    }
  }, [open, client, reset]);

  async function onSubmit(values: FormValues) {
    try {
      const { usaCmms, ...resto } = values;
      const payload = { ...resto, planId: values.planId || null, contractedServices: usaCmms ? ["CMMS_MAINTENANCE" as const] : [] };
      const saved = client ? await updateClient(client.id, payload) : await createClient(payload);
      notify("success", client ? "Cliente atualizado." : "Cliente cadastrado.");
      onSaved(saved);
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={client ? "Editar cliente" : "Novo cliente"} size="lg" footer={
      <>
        <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
        <button type="submit" form="client-form" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </button>
      </>
    }>
      <form id="client-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Razão social" required error={errors.companyName?.message} {...register("companyName")} />
          <TextInput label="Nome fantasia" {...register("tradeName")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="CNPJ" {...register("cnpj")} />
          <TextInput label="Inscrição estadual" {...register("stateRegistration")} />
          <SelectInput
            label="Status"
            options={[
              { value: "PROSPECT", label: "Prospecto" },
              { value: "ACTIVE", label: "Ativo" },
              { value: "INACTIVE", label: "Inativo" },
            ]}
            {...register("status")}
          />
        </div>
        <SelectInput
          label="Plano de assinatura (opcional)"
          hint="Define limites de usuários e ativos. Sem plano, o cliente segue sem limite."
          placeholder="Sem plano (sem limite)"
          options={(plans ?? []).map((p) => ({ value: p.id, label: `${p.name}${p.maxUsers != null || p.maxInstruments != null ? ` (até ${p.maxUsers ?? "∞"} usuários, ${p.maxInstruments ?? "∞"} ativos)` : ""}` }))}
          {...register("planId")}
        />

        <div className="grid gap-4 sm:grid-cols-4">
          <TextInput label="Endereço" className="sm:col-span-2" {...register("addressStreet")} />
          <TextInput label="Número" {...register("addressNumber")} />
          <TextInput label="CEP" {...register("addressZip")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Bairro" {...register("addressDistrict")} />
          <TextInput label="Cidade" {...register("addressCity")} />
          <TextInput label="UF" maxLength={2} {...register("addressState")} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <TextInput label="Telefone" {...register("phone")} />
          <TextInput label="WhatsApp" {...register("whatsapp")} />
          <TextInput label="E-mail" type="email" error={errors.email?.message} {...register("email")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Responsável técnico" {...register("technicalContactName")} />
          <TextInput label="Responsável comercial" {...register("commercialContactName")} />
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <CheckboxInput label="Cliente usa o RLP Maintenance CMMS" {...register("usaCmms")} />
          <p className="mt-1 text-xs text-graphite-500">
            Desmarcado, o cliente fica sem acesso ao sistema (útil para prospecto ainda não ativado).
          </p>
        </div>

        <TextareaInput label="Observações" rows={3} {...register("notes")} />
      </form>
    </Modal>
  );
}
