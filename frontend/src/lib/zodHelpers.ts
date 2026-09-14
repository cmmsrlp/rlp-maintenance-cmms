import { z } from "zod";

/**
 * Numero opcional vindo de um <input type="number"> em branco.
 *
 * O idioma repetido pelo formulario inteiro era `z.coerce.number().optional().or(z.literal(""))`,
 * mas isso nao funciona: `Number("")` e' `0` em JS, entao `z.coerce.number()` sozinho ja
 * validava com sucesso o campo vazio como `0` - o `.or(z.literal(""))` nunca era alcancado.
 * Um campo numerico deixado em branco (limite de medidor, valor/hora, custo unitario...)
 * virava silenciosamente `0` em vez de "nao informado" (achado numa varredura: um medidor
 * sem limite minimo/maximo salvava min=0 e max=0, fazendo qualquer leitura positiva parecer
 * fora da faixa normal). O preprocess troca "" por undefined ANTES do coerce rodar, entao o
 * campo realmente fica opcional.
 */
export function numeroOpcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => (v === "" || v == null ? undefined : v), schema.optional());
}
