import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "./Modal";
import { TextInput } from "./form/Field";
import { changeOwnPassword } from "../api/auth";
import { getApiErrorMessage } from "../api/client";
import { useToast } from "./Toast";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "Repita a nova senha."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { notify } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }, [open, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await changeOwnPassword(values.currentPassword, values.newPassword);
      notify("success", "Senha alterada com sucesso.");
      onClose();
    } catch (error) {
      const message = getApiErrorMessage(error);
      // A senha atual errada e o caso mais comum: mostra no campo certo.
      if (/senha atual/i.test(message)) setError("currentPassword", { message });
      else notify("error", message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Alterar minha senha"
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="change-password-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Alterar senha"}
          </button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <TextInput
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          required
          error={errors.currentPassword?.message}
          {...register("currentPassword")}
        />
        <TextInput
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo de 8 caracteres."
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <TextInput
          label="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
      </form>
    </Modal>
  );
}
