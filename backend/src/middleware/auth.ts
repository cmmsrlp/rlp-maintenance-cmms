import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "../lib/jwt";
import { ForbiddenError, UnauthorizedError } from "../utils/errors";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../utils/asyncHandler";

function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);

  return null;
}

/**
 * Enquanto a senha for provisoria, o sistema so responde ao necessario para troca-la.
 *
 * Nao basta a tela levar para a troca: quem fecha o modal, ou chama a API direto, estaria
 * usando o sistema com uma senha que passou por e-mail ou papel. A resposta traz um codigo
 * proprio para a tela saber levar a pessoa ao lugar certo, em vez de mostrar "sem acesso".
 */
export function blockUntilPasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user?.mustChangePassword) {
    next();
    return;
  }
  const liberado = ["/api/auth/me", "/api/auth/change-password", "/api/auth/logout"];
  if (liberado.includes(req.originalUrl.split("?")[0])) {
    next();
    return;
  }
  next(new ForbiddenError("Troque a senha provisoria para continuar.", "MUST_CHANGE_PASSWORD"));
}

/**
 * Exige um usuario autenticado. Preenche req.user a partir do JWT valido.
 *
 * Alem de validar a assinatura, confere se este token ainda e' a sessao vigente da conta
 * (User.currentSessionId). Um login novo, nesta conta, de outro lugar, gera um sid novo e
 * substitui o antigo - entao um token velho passa a ser recusado aqui na hora, mesmo sem
 * ter expirado. E' o que impede duas pessoas logadas na mesma conta ao mesmo tempo.
 */
export const requireAuth = asyncHandler(async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    next(new UnauthorizedError("Faca login para continuar."));
    return;
  }

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    next(new UnauthorizedError());
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { active: true, deletedAt: true, currentSessionId: true },
  });

  if (!user || !user.active || user.deletedAt) {
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    next(new UnauthorizedError());
    return;
  }

  if (user.currentSessionId !== payload.sid) {
    res.clearCookie(AUTH_COOKIE_NAME, { path: "/" });
    // null = a sessao foi encerrada (logout) - mensagem generica. Um sid diferente e' outro
    // login tendo tomado o lugar deste - so' isso e' de fato "sua conta entrou em outro
    // lugar" (ex.: outra aba com a MESMA sessao que fez logout nao pode levar essa culpa).
    if (user.currentSessionId === null) {
      next(new UnauthorizedError());
    } else {
      next(new UnauthorizedError("Sua conta foi acessada em outro local. Faca login novamente.", "SESSION_REPLACED"));
    }
    return;
  }

  req.user = payload;

  // Senha provisoria segura tudo: nao adianta a tela levar para a troca se a API continua
  // respondendo a quem fechar o modal ou chamar direto.
  blockUntilPasswordChanged(req, res, next);
});

/** Preenche req.user se houver um token valido, mas nao bloqueia requisicoes sem sessao. */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = verifyAuthToken(token);
    } catch {
      // token invalido/expirado: segue como visitante anonimo
    }
  }
  next();
}
