import ExcelJS from "exceljs";

/**
 * Planilha de Criticidade de ativos: uma linha por ativo, com o que ja esta calculado e
 * colunas ao lado para digitar a revisao (Segurança, Produção e o MTBF-meta que alimenta
 * Q). So essas tres colunas (+ motivo) sao lidas de volta na importacao - o resto e'
 * contexto pra quem preenche nao precisar abrir o sistema pra saber o que o ativo tem hoje.
 *
 * Ao contrario da planilha generica de cadastro (modulo imports/), aqui nao ha criacao de
 * registro novo - cada linha casa com um ativo que ja existe pelo ID gravado na coluna A
 * (oculta). Por isso uma unica aba resolve, sem dependencia entre abas.
 */

export interface LinhaCriticidadeParaExportar {
  instrumentId: string;
  tag: string | null;
  description: string | null;
  type: string;
  plantName: string | null;
  areaName: string | null;
  safetyScore: number;
  productionScore: number;
  mtbfTargetHours: number | null;
  mtbfHours: number | null;
  failureCount12m: number | null;
  failureScore: number | null;
  criticalityIndex: number | null;
  criticalityClass: string | null;
}

const AZUL = "FF0060C0";
const CINZA = "FFF1F3F5";
const NOTAS = ["1", "2", "3", "4", "5"];

export async function gerarPlanilhaCriticidade(nomeDaEmpresa: string | undefined, linhas: LinhaCriticidadeParaExportar[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RLP Maintenance CMMS";
  wb.created = new Date();

  // ── Instrucoes ────────────────────────────────────────────────────────────
  const guia = wb.addWorksheet("Como preencher", { properties: { tabColor: { argb: AZUL } } });
  guia.columns = [{ width: 4 }, { width: 110 }];

  const linhasDeTexto: [string, string][] = [
    ["titulo", "Criticidade de ativos - RLP Maintenance CMMS"],
    ["texto", nomeDaEmpresa ? `Planilha gerada para: ${nomeDaEmpresa}` : "Preencha a aba Ativos e envie o arquivo de volta pelo sistema."],
    ["vazio", ""],
    ["secao", "Como funciona"],
    ["texto", "A aba Ativos tem uma linha por ativo, com o que o sistema ja calculou hoje (colunas cinza, so' leitura) e tres colunas para revisar: Segurança, Produção e MTBF-meta."],
    ["texto", "Preencha so' o que quiser mudar - linha sem alteração nenhuma e' ignorada na importação. Toda linha alterada exige um Motivo da revisão (fica no histórico do ativo, com responsável e data)."],
    ["texto", "Não apague nem reordene a coluna 'ID' (A) - e' oculta e e' ela que identifica o ativo. Não renomeie a aba nem o cabeçalho."],
    ["texto", "O sistema confere o arquivo inteiro antes de gravar qualquer coisa e mostra um resumo do que vai mudar, linha a linha, antes de confirmar."],
    ["vazio", ""],
    ["secao", "1. Segurança / SSMA (S) - consequência para pessoas, meio ambiente e conformidade legal"],
    ["texto", "1 = Sem lesão ou impacto ambiental"],
    ["texto", "2 = Lesão leve ou impacto facilmente controlável"],
    ["texto", "3 = Afastamento, dano ambiental reversível ou risco legal moderado"],
    ["texto", "4 = Lesão grave, impacto ambiental significativo ou infração legal"],
    ["texto", "5 = Fatalidade, múltiplas vítimas ou impacto ambiental/regulatório grave"],
    ["vazio", ""],
    ["secao", "2. Produção (P) - considere % de capacidade perdida, duração da parada, redundância/bypass, reserva disponível e tempo de recuperação"],
    ["texto", "1 = Sem parada ou existe redundância integral"],
    ["texto", "2 = Parada local curta, sem perda relevante"],
    ["texto", "3 = Redução de capacidade ou parada parcial"],
    ["texto", "4 = Parada de linha ou perda elevada"],
    ["texto", "5 = Parada total, gargalo principal ou perda crítica"],
    ["vazio", ""],
    ["secao", "3. Quebras (Q) - calculado automaticamente, não se preenche direto"],
    ["texto", "Q compara o MTBF real do ativo (horas operadas / número de falhas) com o MTBF-meta: razão >= 1,25 dá nota 1; entre 1,00 e 1,24 dá nota 2; entre 0,75 e 0,99 dá nota 3; entre 0,50 e 0,74 dá nota 4; abaixo de 0,50 dá nota 5."],
    ["texto", "Preencha a coluna MTBF-meta (h) so' se quiser definir a meta própria do ativo. Deixando em branco, o sistema usa a média do MTBF real dos outros ativos do mesmo tipo (família) - e some 'Meta usada' mostra qual foi."],
    ["vazio", ""],
    ["secao", "Regras de segurança (aplicadas automaticamente, não precisa calcular)"],
    ["texto", "Segurança 5 = Classe A, mesmo sem histórico de quebra."],
    ["texto", "Segurança 4 = Classe A."],
    ["texto", "Produção 5 = Classe A."],
    ["texto", "Sem histórico suficiente (sem falha registrada e sem horímetro), a tela mostra 'Dados insuficientes' em vez de supor Q = 1."],
  ];

  for (const [tipo, texto] of linhasDeTexto) {
    const linha = guia.addRow(["", texto]);
    const celula = linha.getCell(2);
    if (tipo === "titulo") {
      celula.font = { size: 16, bold: true, color: { argb: AZUL } };
      linha.height = 26;
    } else if (tipo === "secao") {
      celula.font = { size: 12, bold: true };
      celula.alignment = { wrapText: true, vertical: "top" };
      linha.height = 30;
    } else {
      celula.font = { size: 11 };
      celula.alignment = { wrapText: true, vertical: "top" };
    }
  }

  // ── Aba de apoio com as notas 1-5 (menu suspenso) ─────────────────────────
  const listasWs = wb.addWorksheet("Listas", { state: "veryHidden" });
  listasWs.getColumn(1).values = ["nota", ...NOTAS];
  const intervaloNotas = `'Listas'!$A$2:$A$${NOTAS.length + 1}`;

  // ── Aba de dados ───────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Ativos");
  ws.columns = [
    { header: "ID", key: "id", width: 10 },
    { header: "TAG", key: "tag", width: 20 },
    { header: "Descrição", key: "descricao", width: 32 },
    { header: "Tipo", key: "tipo", width: 20 },
    { header: "Planta", key: "planta", width: 22 },
    { header: "Área", key: "area", width: 22 },
    { header: "Segurança atual", key: "segurancaAtual", width: 14 },
    { header: "Produção atual", key: "producaoAtual", width: 14 },
    { header: "MTBF real (h)", key: "mtbfReal", width: 14 },
    { header: "Falhas (12m)", key: "falhas12m", width: 12 },
    { header: "Q atual", key: "qAtual", width: 10 },
    { header: "Índice atual", key: "indiceAtual", width: 12 },
    { header: "Classe atual", key: "classeAtual", width: 12 },
    { header: "Nova Segurança (1-5)", key: "novaSeguranca", width: 18 },
    { header: "Nova Produção (1-5)", key: "novaProducao", width: 18 },
    { header: "MTBF-meta (h)", key: "novoMtbfMeta", width: 16 },
    { header: "Motivo da revisão", key: "motivo", width: 40 },
  ];

  const CHAVES_SOMENTE_LEITURA = new Set(["id", "tag", "descricao", "tipo", "planta", "area", "segurancaAtual", "producaoAtual", "mtbfReal", "falhas12m", "qAtual", "indiceAtual", "classeAtual"]);
  const CHAVES_EDITAVEIS = new Set(["novaSeguranca", "novaProducao", "novoMtbfMeta", "motivo"]);

  const cabecalho = ws.getRow(1);
  cabecalho.height = 30;
  cabecalho.eachCell((celula, i) => {
    const chave = ws.columns[i - 1]?.key as string;
    celula.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CHAVES_EDITAVEIS.has(chave) ? AZUL : "FF6B7A8A" } };
    celula.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  ws.getColumn(1).hidden = true;

  for (const l of linhas) {
    const linha = ws.addRow({
      id: l.instrumentId,
      tag: l.tag ?? "",
      descricao: l.description ?? "",
      tipo: l.type,
      planta: l.plantName ?? "",
      area: l.areaName ?? "",
      segurancaAtual: l.safetyScore,
      producaoAtual: l.productionScore,
      mtbfReal: l.mtbfHours != null ? Math.round(l.mtbfHours) : "",
      falhas12m: l.failureCount12m ?? "",
      qAtual: l.failureScore ?? "sem dados",
      indiceAtual: l.criticalityIndex ?? "",
      classeAtual: l.criticalityClass ?? "dados insuficientes",
      novaSeguranca: l.safetyScore,
      novaProducao: l.productionScore,
      novoMtbfMeta: l.mtbfTargetHours ?? "",
      motivo: "",
    });
    linha.eachCell((celula, i) => {
      const chave = ws.columns[i - 1]?.key as string;
      if (CHAVES_SOMENTE_LEITURA.has(chave)) {
        celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
        celula.font = { color: { argb: "FF6B7A8A" } };
      }
    });
  }

  // Menu suspenso 1-5 nas colunas Nova Segurança / Nova Produção.
  const colunaSeguranca = ws.getColumn("novaSeguranca").letter;
  const colunaProducao = ws.getColumn("novaProducao").letter;
  const ultimaLinha = linhas.length + 1;
  for (const letra of [colunaSeguranca, colunaProducao]) {
    for (let i = 2; i <= ultimaLinha; i += 1) {
      ws.getCell(`${letra}${i}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [intervaloNotas],
        showErrorMessage: true,
        errorStyle: "warning",
        errorTitle: "Nota invalida",
        error: "Escolha um valor de 1 a 5.",
      };
    }
  }

  const arquivo = await wb.xlsx.writeBuffer();
  return Buffer.from(arquivo as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Leitura da planilha preenchida
// ---------------------------------------------------------------------------

export interface LinhaCriticidadeLida {
  numero: number;
  instrumentId: string;
  tag: string;
  novaSeguranca: number | null;
  novaProducao: number | null;
  novoMtbfMeta: number | null;
  novoMtbfMetaInformado: boolean;
  motivo: string;
}

function texto(valor: ExcelJS.CellValue): string {
  if (valor == null) return "";
  if (typeof valor === "object") {
    if ("result" in valor && valor.result != null) return String(valor.result).trim();
    if ("richText" in valor && Array.isArray(valor.richText)) return valor.richText.map((p) => p.text).join("").trim();
    if ("text" in valor && typeof valor.text === "string") return valor.text.trim();
    return "";
  }
  return String(valor).trim();
}

function numeroOuNulo(valor: string): number | null {
  if (!valor) return null;
  const limpo = valor.replace(/\s/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export async function lerPlanilhaCriticidade(buffer: Buffer): Promise<LinhaCriticidadeLida[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.getWorksheet("Ativos");
  if (!ws) return [];

  const CHAVES = ["id", "tag", "descricao", "tipo", "planta", "area", "segurancaAtual", "producaoAtual", "mtbfReal", "falhas12m", "qAtual", "indiceAtual", "classeAtual", "novaSeguranca", "novaProducao", "novoMtbfMeta", "motivo"];
  const linhas: LinhaCriticidadeLida[] = [];

  ws.eachRow((row, numero) => {
    if (numero === 1) return;
    const valores: Record<string, string> = {};
    CHAVES.forEach((chave, i) => {
      valores[chave] = texto(row.getCell(i + 1).value);
    });
    if (!valores.id) return;

    linhas.push({
      numero,
      instrumentId: valores.id,
      tag: valores.tag,
      novaSeguranca: numeroOuNulo(valores.novaSeguranca),
      novaProducao: numeroOuNulo(valores.novaProducao),
      novoMtbfMeta: numeroOuNulo(valores.novoMtbfMeta),
      novoMtbfMetaInformado: valores.novoMtbfMeta !== "",
      motivo: valores.motivo,
    });
  });

  return linhas;
}
