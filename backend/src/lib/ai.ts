import { env } from "../config/env";

export interface DadosClienteParaInsight {
  clientId: string;
  nome: string;
  planosAtrasados: number;
  ordensAbertas: number;
  pecasEmFalta: number;
  usoUsuariosPct: number | null;
  usoAtivosPct: number | null;
}

export interface InsightGerado {
  clientId: string;
  severity: "OK" | "ATTENTION" | "CRITICAL";
  summary: string;
}

const MODEL = "gemini-3.6-flash";

function montarPrompt(clientes: DadosClienteParaInsight[]): string {
  const linhas = clientes.map((c) =>
    [
      `- clientId: ${c.clientId}`,
      `  nome: ${c.nome}`,
      `  planos_de_manutencao_atrasados: ${c.planosAtrasados}`,
      `  ordens_de_manutencao_abertas: ${c.ordensAbertas}`,
      `  pecas_em_falta_no_almoxarifado: ${c.pecasEmFalta}`,
      `  uso_do_limite_de_usuarios_pct: ${c.usoUsuariosPct ?? "sem_limite"}`,
      `  uso_do_limite_de_ativos_pct: ${c.usoAtivosPct ?? "sem_limite"}`,
    ].join("\n"),
  );

  return `Voce e' um analista de sucesso do cliente de um sistema de manutencao industrial (CMMS).
Para cada cliente listado abaixo, avalie a saude da operacao dele SOMENTE com base nos numeros
dados (nao invente dados que nao foram informados) e escreva uma sugestao curta e pratica
(1-2 frases, em portugues do Brasil) do que a equipe interna deveria fazer a respeito.

Classifique a severidade:
- "CRITICAL": risco real e imediato (ex.: muitas ordens atrasadas/abertas, uso do plano estourando).
- "ATTENTION": merece atencao mas nao e' urgente.
- "OK": operacao dentro do esperado, sem acao necessaria.

Clientes:
${linhas.join("\n\n")}

Responda APENAS com um JSON valido (sem markdown, sem texto antes ou depois), no formato:
[{"clientId": "...", "severity": "OK" | "ATTENTION" | "CRITICAL", "summary": "..."}]`;
}

/**
 * Sem GEMINI_API_KEY configurada, retorna lista vazia (no-op) - mesmo padrao do
 * lib/email.ts: funcionalidade opcional, nao quebra o resto do sistema se faltar.
 */
export async function gerarInsightsDeClientes(clientes: DadosClienteParaInsight[]): Promise<InsightGerado[]> {
  if (!env.geminiApiKey || clientes.length === 0) return [];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: montarPrompt(clientes) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao gerar insights (Gemini respondeu ${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  const bruto = JSON.parse(texto) as { clientId?: string; severity?: string; summary?: string }[];
  const idsValidos = new Set(clientes.map((c) => c.clientId));
  const severidadesValidas = new Set(["OK", "ATTENTION", "CRITICAL"]);

  return bruto.filter(
    (item): item is InsightGerado =>
      !!item.clientId && idsValidos.has(item.clientId) && !!item.severity && severidadesValidas.has(item.severity) && !!item.summary,
  );
}

export interface AnaliseDeLaudo {
  severity: "OK" | "ATTENTION" | "CRITICAL";
  summary: string;
}

const PROMPT_LAUDO = `Voce e' um engenheiro de manutencao especialista em analise de falhas indireta - vibracao,
analise de oleo, termografia, ensaios nao destrutivos e laudos tecnicos em geral.

Leia o documento anexado e responda SOMENTE com base no que esta escrito nele (nao invente
numeros ou conclusoes que o laudo nao traz). Escreva um resumo pratico (2-4 frases, em
portugues do Brasil) com: o que o laudo identificou, a gravidade do achado, e o que a equipe de
manutencao deveria fazer a respeito (ex.: acompanhar, planejar troca, agir imediatamente).

Classifique a severidade:
- "CRITICAL": falha iminente ou achado grave que exige acao imediata.
- "ATTENTION": alteracao relevante que merece acompanhamento, sem risco imediato.
- "OK": dentro dos parametros normais, sem achado que preocupe.

Se o documento nao for um laudo tecnico reconhecivel (vibracao, oleo, termografia, inspecao,
etc.), responda com severity "ATTENTION" e explique no summary que o documento nao parece ser
um laudo tecnico.

Responda APENAS com um JSON valido (sem markdown, sem texto antes ou depois), no formato:
{"severity": "OK" | "ATTENTION" | "CRITICAL", "summary": "..."}`;

/**
 * Le um laudo (PDF) anexado pelo cliente - vibracao, analise de oleo, termografia etc. - e
 * devolve um resumo pratico com severidade, no mesmo formato do ClientInsight. Sem
 * GEMINI_API_KEY configurada, lanca erro (diferente de gerarInsightsDeClientes): aqui o
 * cliente esta esperando um resultado imediato de uma acao que ele mesmo disparou, entao um
 * "no-op silencioso" seria confuso - melhor a rota devolver um erro claro.
 */
export async function analisarLaudo(bufferArquivo: Buffer, mimeType: string): Promise<AnaliseDeLaudo> {
  if (!env.geminiApiKey) {
    throw new Error("IA nao configurada (GEMINI_API_KEY ausente).");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${env.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT_LAUDO }, { inline_data: { mime_type: mimeType, data: bufferArquivo.toString("base64") } }],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao analisar o laudo (Gemini respondeu ${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) throw new Error("A IA nao retornou uma analise para este documento.");

  const bruto = JSON.parse(texto) as { severity?: string; summary?: string };
  const severidadesValidas = new Set(["OK", "ATTENTION", "CRITICAL"]);
  if (!bruto.severity || !severidadesValidas.has(bruto.severity) || !bruto.summary) {
    throw new Error("A IA retornou uma resposta em formato inesperado.");
  }

  return { severity: bruto.severity as AnaliseDeLaudo["severity"], summary: bruto.summary };
}
