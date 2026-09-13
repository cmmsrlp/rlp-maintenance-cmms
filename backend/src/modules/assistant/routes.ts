import { Router } from "express";
import { requireAuth } from "../../middleware/auth";
import { chatComAssistente } from "./controller";

export const assistantRouter = Router();

// Sem restricao de papel alem de estar logado: e' so orientacao sobre o sistema, sem
// acesso a dado nenhum de cliente - a tela so aparece no portal, mas a rota em si nao
// precisa negar a equipe interna (ADMIN em acesso master, por exemplo).
assistantRouter.use(requireAuth);

assistantRouter.post("/chat", chatComAssistente);
