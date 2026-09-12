import { Resend } from "resend";
import { env } from "../config/env";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

/**
 * Sem RESEND_API_KEY configurada (ambiente local, por exemplo), o envio vira um no-op
 * silencioso - "esqueci a senha" continua funcionando (gera e grava a senha nova), so' nao
 * manda o e-mail. Evita quebrar o resto do sistema por falta de uma chave de terceiro.
 */
export async function sendTemporaryPasswordEmail(to: string, name: string, temporaryPassword: string): Promise<void> {
  if (!resend) return;

  await resend.emails.send({
    from: env.emailFrom,
    to,
    subject: "Sua senha temporaria - RLP Maintenance CMMS",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #22252b;">
        <h2 style="color: #0b1729;">Redefinicao de senha</h2>
        <p>Ola, ${name}.</p>
        <p>Alguem (esperamos que voce) pediu para redefinir a senha da sua conta no RLP Maintenance CMMS. Use a senha temporaria abaixo para entrar - ela vale so' para este primeiro acesso, e o sistema vai pedir para voce escolher uma nova em seguida.</p>
        <p style="font-size: 1.4em; font-weight: bold; background: #f4f5f6; padding: 12px 16px; border-radius: 8px; letter-spacing: 0.05em; text-align: center;">
          ${temporaryPassword}
        </p>
        <p>Se voce nao pediu essa redefinicao, pode ignorar este e-mail - sua senha atual continua valendo normalmente ate' que essa temporaria seja usada.</p>
        <p style="color: #7c8493; font-size: 0.85em;">RLP Maintenance - Reliability, Lifecycle &amp; Performance</p>
      </div>
    `,
  });
}
