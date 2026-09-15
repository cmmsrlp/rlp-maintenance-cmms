import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "../../../components/Modal";
import { TextInput, SelectInput } from "../../../components/form/Field";
import { ClientPicker } from "../../../components/ClientPicker";
import { createUser, updateUser } from "../../../api/users";
import type { UserAccount } from "../../../api/types";
import { useToast } from "../../../components/Toast";
import { getApiErrorMessage } from "../../../api/client";

const baseSchema = z.object({
  name: z.string().min(2, "Informe o nome."),
  email: z.string().email("E-mail inválido."),
  role: z.enum(["ADMIN", "TECHNICIAN", "COMMERCIAL", "CLIENT", "CLIENT_PLANNER", "CLIENT_TECHNICIAN", "REQUESTER"]),
  clientId: z.string().uuid().optional().or(z.literal("")),
});
const createSchema = baseSchema.extend({ password: z.string().min(8, "Mínimo de 8 caracteres.") });
type FormValues = z.infer<typeof createSchema>;

export function UserFormModal({
  open,
  onClose,
  onSaved,
  user,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  user?: UserAccount;
}) {
  const { notify } = useToast();
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(user ? baseSchema.extend({ password: z.string().optional() }) : createSchema),
    defaultValues: { role: "TECHNICIAN" },
  });
  const role = watch("role");

  useEffect(() => {
    if (open) {
      reset(
        user
          ? { name: user.name, email: user.email, role: user.role, clientId: user.clientId ?? "" }
          : { role: "TECHNICIAN" },
      );
    }
  }, [open, user, reset]);

  async function onSubmit(values: FormValues) {
    try {
      if (user) {
        await updateUser(user.id, { name: values.name, role: values.role, clientId: values.clientId || null });
        notify("success", "Usuário atualizado.");
      } else {
        await createUser({ ...values, password: values.password! });
        notify("success", "Usuário criado.");
      }
      onSaved();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={user ? "Editar usuário" : "Novo usuário"} footer={
      <>
        <button type="button" className="btn-outline" onClick={onClose}>Cancelar</button>
        <button type="submit" form="user-form" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "Salvando..." : "Salvar"}
        </button>
      </>
    }>
      <form id="user-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextInput label="Nome" required error={errors.name?.message} {...register("name")} />
        <TextInput label="E-mail" type="email" required disabled={!!user} error={errors.email?.message} {...register("email")} />
        {!user && (
          <TextInput label="Senha inicial" type="password" required error={errors.password?.message} {...register("password")} />
        )}
        <SelectInput
          label="Perfil"
          required
          options={[
            { value: "ADMIN", label: "Administrador" },
            { value: "TECHNICIAN", label: "Técnico" },
            { value: "COMMERCIAL", label: "Comercial" },
            { value: "CLIENT", label: "Cliente" },
            { value: "REQUESTER", label: "Solicitante (só abre solicitações)" },
          ]}
          hint={
            role === "REQUESTER"
              ? "Abre e acompanha as próprias solicitações de serviço, e mais nada. Não consome vaga do plano - é ilimitado."
              : undefined
          }
          error={errors.role?.message}
          {...register("role")}
        />
        {(role === "CLIENT" || role === "REQUESTER") && (
          <ClientPicker label="Empresa vinculada" required error={errors.clientId?.message} {...register("clientId")} />
        )}
      </form>
    </Modal>
  );
}
