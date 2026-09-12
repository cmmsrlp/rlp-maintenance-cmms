import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "../../lib/prisma";
import { comparePassword, hashPassword, generateTemporaryPassword } from "../../lib/password";
import { AUTH_COOKIE_NAME, signAuthToken } from "../../lib/jwt";
import { env } from "../../config/env";
import { asyncHandler } from "../../utils/asyncHandler";
import { UnauthorizedError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { sendTemporaryPasswordEmail } from "../../lib/email";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(1, "Informe a senha."),
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
});

const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict" as const,
  maxAge: 12 * 60 * 60 * 1000,
  path: "/",
};

function serializeUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  clientId: string | null;
  mustChangePassword?: boolean;
  client: { id: string; companyName: string; tradeName: string | null; contractedServices: string[] } | null;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    // A tela leva para a troca antes de qualquer outra coisa quando isto e' true.
    mustChangePassword: !!user.mustChangePassword,
    client: user.client,
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { client: { select: { id: true, companyName: true, tradeName: true, contractedServices: true } } },
  });

  if (!user || !user.active || user.deletedAt) {
    throw new UnauthorizedError("E-mail ou senha invalidos.");
  }

  const passwordOk = await comparePassword(password, user.passwordHash);
  if (!passwordOk) {
    throw new UnauthorizedError("E-mail ou senha invalidos.");
  }

  // Sessao nova substitui qualquer outra que esta conta tinha aberta em outro lugar - so
  // uma pessoa por vez usando o mesmo login. O token velho para de valer na hora (conferido
  // em requireAuth), mesmo que ainda nao tenha expirado.
  const sessionId = randomUUID();
  const token = signAuthToken({
    sub: user.id,
    role: user.role,
    clientId: user.clientId,
    mustChangePassword: user.mustChangePassword,
    sid: sessionId,
  });
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions);

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), currentSessionId: sessionId } });
  await writeAuditLog({ userId: user.id, action: "LOGIN", entityType: "User", entityId: user.id });

  res.json({ user: serializeUser(user), token });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  // Derruba a sessao no servidor, e nao so o cookie deste navegador - sem isso, um token
  // que tenha vazado (ou uma aba que nao recebeu o clearCookie) continuaria valendo.
  if (req.user?.sub) {
    await prisma.user.updateMany({
      where: { id: req.user.sub, currentSessionId: req.user.sid },
      data: { currentSessionId: null },
    });
  }
  res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
  res.status(204).send();
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual."),
    newPassword: z.string().min(8, "A nova senha deve ter pelo menos 8 caracteres."),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["newPassword"],
  });

/** Troca da propria senha: exige a senha atual, para um login esquecido aberto
 * nao permitir que outra pessoa assuma a conta. */
export const changeOwnPassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findFirst({ where: { id: req.user.sub, deletedAt: null, active: true } });
  if (!user) throw new UnauthorizedError();

  const ok = await comparePassword(currentPassword, user.passwordHash);
  if (!ok) throw new UnauthorizedError("Senha atual incorreta.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
  });

  // O token carrega a marca da senha provisoria: sem reemitir, a pessoa trocaria a senha e
  // continuaria bloqueada ate a sessao expirar. Mantem o mesmo sid - trocar a senha e' a
  // sessao atual continuando, nao um login novo, entao nao deve derrubar a si mesma.
  res.cookie(
    AUTH_COOKIE_NAME,
    signAuthToken({ sub: user.id, role: user.role, clientId: user.clientId, mustChangePassword: false, sid: req.user.sid }),
    cookieOptions,
  );

  await writeAuditLog({
    userId: user.id,
    action: "UPDATE",
    entityType: "User",
    entityId: user.id,
    description: "Senha alterada pelo proprio usuario",
  });

  res.status(204).send();
});

/** Publica (sem login) - gera senha temporaria e manda por e-mail. Resposta sempre generica,
 * mesmo se o e-mail nao existir, para nao dar pra descobrir quais e-mails estao cadastrados
 * so tentando essa rota (enumeracao de contas). */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (user && user.active && !user.deletedAt) {
    const temporaryPassword = generateTemporaryPassword();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, currentSessionId: null },
    });
    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entityType: "User",
      entityId: user.id,
      description: "Senha redefinida via 'esqueci a senha' (autoatendimento)",
    });
    await sendTemporaryPasswordEmail(user.email, user.name, temporaryPassword);
  }

  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();

  const user = await prisma.user.findUnique({
    where: { id: req.user.sub },
    include: { client: { select: { id: true, companyName: true, tradeName: true, contractedServices: true } } },
  });

  if (!user || !user.active || user.deletedAt) throw new UnauthorizedError();

  res.json({ user: serializeUser(user) });
});
