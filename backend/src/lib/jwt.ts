import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "@prisma/client";

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  clientId: string | null;
  /** Senha provisoria ainda nao trocada. Vem no token para a checagem nao custar uma
   * consulta ao banco em toda requisicao; ao trocar a senha, o token e' reemitido. */
  mustChangePassword?: boolean;
  /** Identifica a sessao deste token - comparado com User.currentSessionId a cada
   * requisicao. So' o login mais recente tem o valor batendo; um login novo (nesta conta,
   * de outro lugar) invalida este token na hora, sem esperar expirar. */
  sid: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
}

export const AUTH_COOKIE_NAME = "optiprocess_token";
