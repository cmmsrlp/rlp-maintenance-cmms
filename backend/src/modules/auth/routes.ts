import { Router } from "express";
import { login, logout, me, changeOwnPassword, forgotPassword } from "./controller";
import { requireAuth, attachUserIfPresent } from "../../middleware/auth";
import { loginRateLimit } from "../../middleware/rateLimit";

export const authRouter = Router();

authRouter.post("/login", loginRateLimit, login);
// attachUserIfPresent (nao requireAuth): um token ja substituido por outro login precisa
// conseguir deslogar mesmo assim - requireAuth recusaria antes de o handler rodar.
authRouter.post("/logout", attachUserIfPresent, logout);
authRouter.get("/me", requireAuth, me);
// Mesmo rate limit do login: a rota confere a senha atual, entao e alvo de forca bruta.
authRouter.post("/change-password", loginRateLimit, requireAuth, changeOwnPassword);
// Publica, sem requireAuth (e' exatamente pra quem nao consegue logar) - mesmo rate limit do
// login pra nao virar uma forma barata de fazer alguem tomar spam de e-mail em loop.
authRouter.post("/forgot-password", loginRateLimit, forgotPassword);
