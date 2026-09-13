import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ValidationError } from "../../utils/errors";
import { responderAssistente, type MensagemDoChat } from "../../lib/ai";

// So os ultimos N turnos vao pro modelo - suficiente pra manter o contexto da conversa sem
// deixar o prompt crescer sem limite numa conversa longa.
const MAX_MENSAGENS = 12;

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(MAX_MENSAGENS),
});

export const chatComAssistente = asyncHandler(async (req: Request, res: Response) => {
  const { messages } = chatSchema.parse(req.body);

  let resposta: string;
  try {
    resposta = await responderAssistente(messages as MensagemDoChat[]);
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "Falha ao consultar o assistente.");
  }

  res.json({ reply: resposta });
});
