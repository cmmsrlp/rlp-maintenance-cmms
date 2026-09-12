import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { homeForRole } from "../../auth/ProtectedRoute";
import { TextInput } from "../../components/form/Field";
import { getApiErrorMessage } from "../../api/client";
import { CmmsLogo } from "../../components/CmmsLogo";
import { Modal } from "../../components/Modal";
import * as authApi from "../../api/auth";

const schema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe a senha."),
});
type FormValues = z.infer<typeof schema>;

const forgotSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
});
type ForgotFormValues = z.infer<typeof forgotSchema>;

function ForgotPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ForgotFormValues>({ resolver: zodResolver(forgotSchema) });

  function handleClose() {
    setSent(false);
    reset();
    onClose();
  }

  async function onSubmit(values: ForgotFormValues) {
    // Sempre mostra a mesma confirmacao, exista ou nao o e-mail - o backend faz o mesmo
    // (204 generico), pra nao dar pra descobrir contas cadastradas so tentando aqui.
    await authApi.forgotPassword(values.email);
    setSent(true);
  }

  return (
    <Modal open={open} onClose={handleClose} title="Esqueci a senha" size="sm">
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm text-graphite-600">
            Se houver uma conta com esse e-mail, enviamos uma senha temporária para ela agora. Confira sua caixa de
            entrada (e o spam) e use-a para entrar - o sistema vai pedir para você escolher uma senha nova em seguida.
          </p>
          <button type="button" className="btn-primary w-full" onClick={handleClose}>
            Entendi
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <p className="text-sm text-graphite-500">
            Informe o e-mail da sua conta. Se ele existir, enviaremos uma senha temporária.
          </p>
          <TextInput
            label="E-mail"
            type="email"
            autoComplete="username"
            required
            error={errors.email?.message}
            {...register("email")}
          />
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar senha temporária"}
          </button>
        </form>
      )}
    </Modal>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  // A API derruba a sessao anterior quando a mesma conta loga em outro lugar - o navegador
  // atingido cai aqui sozinho (interceptor em api/client.ts), e precisa entender por que.
  const sessaoEncerradaAlhures = new URLSearchParams(location.search).get("motivo") === "outro-local";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeForRole(user.role), { replace: true });
    } catch (error) {
      setServerError(getApiErrorMessage(error, "Não foi possível entrar. Verifique suas credenciais."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <CmmsLogo variant="dark" size="xl" />
          <p className="mt-3 text-sm text-graphite-500">Acesse a gestão interna ou o portal do cliente</p>
        </div>

        {sessaoEncerradaAlhures && (
          <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Sua sessão foi encerrada porque esta conta foi acessada em outro local. Só um acesso por vez é permitido.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <TextInput
            label="E-mail"
            type="email"
            autoComplete="username"
            required
            error={errors.email?.message}
            {...register("email")}
          />
          <TextInput
            label="Senha"
            type="password"
            autoComplete="current-password"
            required
            error={errors.password?.message}
            {...register("password")}
          />

          {serverError && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-safety-red">{serverError}</p>}

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm">
          <button type="button" onClick={() => setForgotOpen(true)} className="text-navy-700 hover:underline">
            Esqueci a senha
          </button>
        </p>

        <p className="mt-6 text-center text-sm text-graphite-500">
          <Link to="/" className="hover:text-navy-700">
            Voltar ao site
          </Link>
        </p>
      </div>

      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  );
}
