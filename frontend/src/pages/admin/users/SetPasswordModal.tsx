import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Modal } from "../../../components/Modal";
import { TextInput } from "../../../components/form/Field";
import { setUserPassword } from "../../../api/users";
import type { UserAccount } from "../../../api/types";
import { getApiErrorMessage } from "../../../api/client";
import { useToast } from "../../../components/Toast";

const schema = z
  .object({
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres."),
    confirmPassword: z.string().min(1, "Repita a senha."),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "As senhas não conferem.",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function SetPasswordModal({
  user,
  onClose,
}: {
  user?: UserAccount;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (user) reset({ password: "", confirmPassword: "" });
  }, [user, reset]);

  async function onSubmit(values: FormValues) {
    if (!user) return;
    try {
      await setUserPassword(user.id, values.password);
      notify("success", `Senha de ${user.name} atualizada.`);
      onClose();
    } catch (error) {
      notify("error", getApiErrorMessage(error));
    }
  }

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={`Definir senha - ${user?.name ?? ""}`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="set-password-form" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Definir senha"}
          </button>
        </>
      }
    >
      <form id="set-password-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <p className="text-sm text-graphite-500">
          A nova senha passa a valer imediatamente. Combine com {user?.name?.split(" ")[0]} por um canal seguro.
        </p>
        <TextInput
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          required
          hint="Mínimo de 8 caracteres."
          error={errors.password?.message}
          {...register("password")}
        />
        <TextInput
          label="Repita a senha"
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
