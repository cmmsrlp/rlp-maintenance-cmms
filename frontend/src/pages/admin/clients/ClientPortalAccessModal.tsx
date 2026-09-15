import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dices } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { createUser } from "../../../api/users";
import type { Client } from "../../../api/types";
import { getApiErrorMessage } from "../../../api/client";
import { useToast } from "../../../components/Toast";

const schema = z.object({
  name: z.string().min(2, "Informe o nome de quem vai acessar."),
  email: z.string().email("E-mail inválido."),
  password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
});
type FormValues = z.infer<typeof schema>;

function generateStrongPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$%&*";
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function ClientPortalAccessModal({
  open,
  onClose,
  onCreated,
  client,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  client?: Client;
}) {
  const { notify } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open && client) {
      reset({ name: client.technicalContactName || client.commercialContactName || "", email: client.email ?? "", password: generateStrongPassword() });
    }
  }, [open, client, reset]);

  async function onSubmit(values: FormValues) {
    if (!client) return;
    try {
      await createUser({ ...values, role: "CLIENT", clientId: client.id });
      notify("success", `Acesso ao portal liberado para ${values.email}.`);
      onCreated();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Liberar acesso ao portal - ${client?.tradeName || client?.companyName || ""}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="portal-access-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Criando..." : "Liberar acesso"}
          </button>
        </>
      }
    >
      <form id="portal-access-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <p className="text-sm text-graphite-500">
          Cria um login de portal para esta empresa. O acesso mostra apenas as áreas dos serviços marcados como
          contratados na ficha do cliente.
        </p>
        <TextInput label="Nome de quem vai acessar" required error={errors.name?.message} {...register("name")} />
        <TextInput label="E-mail de acesso" type="email" required error={errors.email?.message} {...register("email")} />
        <div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <TextInput
                label="Senha inicial"
                required
                hint="Repasse ao cliente por um canal seguro (WhatsApp, etc)."
                error={errors.password?.message}
                {...register("password")}
              />
            </div>
            <button
              type="button"
              className="btn-outline btn-sm mb-0.5 shrink-0"
              title="Gerar outra senha"
              onClick={() => setValue("password", generateStrongPassword(), { shouldValidate: true })}
            >
              <Dices className="h-4 w-4" /> Gerar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
