import { z } from "zod";

// Brasil nao usa mais horario de verao desde 2019 - America/Sao_Paulo e' sempre UTC-3, sem
// excecao sazonal, entao um offset fixo aqui e' seguro (nao e' a simplificacao arriscada que
// seria para um fuso com DST).
const OFFSET_SAO_PAULO = "-03:00";
const TEM_FUSO_EXPLICITO = /(?:[zZ]|[+-]\d{2}:\d{2})$/;
const APENAS_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Um <input type="date"> manda "2026-09-14" (sem fuso) e um <input type="datetime-local">
 * manda "2026-09-14T09:00" (idem) - nenhum dos dois diz em que fuso aquela hora de parede
 * foi digitada. Sem isso, `new Date(...)` interpretava os dois de um jeito diferente e
 * igualmente errado: uma data pura vira meia-noite em UTC (nao em Sao Paulo - exibida de
 * volta em Sao Paulo (UTC-3), cai no dia anterior as 21h: 14/09 virava 13/09); uma data com
 * hora sem fuso vira a hora local do PROCESSO NODE, que no Render roda em UTC - "09:00" de
 * parede era gravado como 09:00 UTC (=06:00 em Sao Paulo), 3h adiantado do que a pessoa
 * realmente digitou. Aqui a hora de parede recebida e' declarada explicitamente como sendo
 * de Sao Paulo antes de virar Date, entao o resultado independe do fuso onde o processo
 * Node roda.
 */
function comFusoDeSaoPaulo(valor: string): string {
  if (TEM_FUSO_EXPLICITO.test(valor)) return valor; // ja' inequivoco, nao mexe.
  if (APENAS_DATA.test(valor)) return `${valor}T00:00:00${OFFSET_SAO_PAULO}`;
  return `${valor}${OFFSET_SAO_PAULO}`;
}

function preprocessarData(v: unknown): unknown {
  if (typeof v === "string") return v === "" ? null : comFusoDeSaoPaulo(v);
  return v ?? null;
}

/**
 * Data opcional que aceita campo vazio.
 *
 * Um <input type="date"> em branco manda "" - e z.coerce.date() transforma isso num
 * "Invalid date" que o formulario devolve como erro de validacao no meio do salvamento,
 * sem dizer a quem preencheu que o problema e' um campo que ele deliberadamente deixou em
 * branco. Aqui "" e' o que sempre foi: nenhuma data.
 */
export const dataOpcional = z.preprocess(preprocessarData, z.coerce.date().nullable());

/** Mesma correcao de fuso de `dataOpcional`, para campos de data obrigatorios
 * (ex.: inicio de uma parada) - "" aqui e' erro de validacao de verdade, nao "sem data". */
export const dataObrigatoria = z.preprocess(preprocessarData, z.coerce.date());
