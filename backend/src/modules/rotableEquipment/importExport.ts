import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { NotFoundError, ValidationError } from "../../utils/errors";
import { assertServiceAccess, clientScopeFilter, resolveClientId } from "../../middleware/rbac";
import { writeAuditLog } from "../../utils/audit";
import { recalcularCriticidade } from "../../lib/assetCriticality";
import { TIPOS_PADRAO, tipoPadraoDoNome, type CampoEspecifico } from "./camposPorTipo";

/**
 * Importacao/exportacao por planilha dos Equipamentos recondicionaveis - uma aba por TIPO
 * (Motor, Redutor, Bomba...), cada uma com as colunas comuns mais os campos tecnicos
 * especificos daquele tipo, na mesma logica da ficha tecnica da tela (camposPorTipo.ts).
 *
 * Mesma filosofia da importacao geral (modulo imports/): confere o arquivo inteiro antes de
 * gravar qualquer coisa, e o que ja existe (mesmo codigo) e' IGNORADO por padrao, nunca
 * sobrescrito.
 */

const AZUL = "FF0060C0";
const CINZA = "FFF1F3F5";
const ABA_OUTROS = "Outros";

/** Prefixo do codigo de exemplo por aba - mesmos prefixos do catalogo padrao de tipos
 * (migration 20260915080000/20260915090000), so' para o exemplo nao colidir entre abas com
 * nome parecido (ex.: "Bomba" e "Bomba de vacuo" ambas comecariam com "BOM"). */
const PREFIXO_DE_EXEMPLO: Record<string, string> = {
  Motor: "MOT",
  Redutor: "RED",
  "Bomba de vácuo": "BVA",
  Bomba: "BMB",
  Rolo: "ROL",
  "Unidade compressora": "UCM",
  "Trocador de calor": "TRC",
  [ABA_OUTROS]: "OUT",
};

const COLUNAS_COMUNS: { chave: string; titulo: string; obrigatoria?: boolean; ajuda: string; largura?: number }[] = [
  { chave: "codigo", titulo: "Codigo*", obrigatoria: true, ajuda: "Codigo unico do equipamento nesta empresa. Ex.: MOT-004", largura: 18 },
  { chave: "fabricante", titulo: "Fabricante", ajuda: "Opcional", largura: 20 },
  { chave: "modelo", titulo: "Modelo", ajuda: "Opcional", largura: 20 },
  { chave: "numeroDeSerie", titulo: "Numero de serie", ajuda: "Opcional", largura: 20 },
  { chave: "tagDoAtivo", titulo: "TAG do ativo (instalar)", ajuda: "Opcional. TAG exato de um ativo ja cadastrado - se preenchido, o equipamento entra ja instalado nele. Deixe em branco para o equipamento nascer em estoque.", largura: 26 },
  { chave: "custoDeAquisicao", titulo: "Custo de aquisicao", ajuda: "Opcional. Numero. Ex.: 4500", largura: 18 },
  { chave: "observacoes", titulo: "Observacoes", ajuda: "Opcional", largura: 30 },
];

interface DefinicaoDeAbaRotable {
  nome: string;
  /** null para a aba "Outros", que tem coluna de tipo livre em vez de tipo fixo pelo nome da aba. */
  campos: CampoEspecifico[] | null;
}

function montarAbas(): DefinicaoDeAbaRotable[] {
  return [...TIPOS_PADRAO.map((t) => ({ nome: t.nome, campos: t.campos })), { nome: ABA_OUTROS, campos: null }];
}

// ---------------------------------------------------------------------------
// Modelo de importacao
// ---------------------------------------------------------------------------

export const baixarModeloRotable = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const { clientId } = req.query as { clientId?: string };
  const alvo = clientId ?? clientScopeFilter(req).clientId;

  let nomeDaEmpresa: string | undefined;
  if (alvo) {
    const cliente = await prisma.client.findFirst({ where: { id: alvo }, select: { companyName: true } });
    nomeDaEmpresa = cliente?.companyName;
  }

  const arquivo = await gerarPlanilhaModeloRotable(nomeDaEmpresa);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modelo-equipamentos-recondicionaveis.xlsx"');
  res.end(arquivo);
});

async function gerarPlanilhaModeloRotable(nomeDaEmpresa?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "RLP Maintenance CMMS";
  wb.created = new Date();

  const guia = wb.addWorksheet("Como preencher", { properties: { tabColor: { argb: AZUL } } });
  guia.columns = [{ width: 4 }, { width: 110 }];
  const linhas: [string, string][] = [
    ["titulo", "Importacao de equipamentos recondicionaveis"],
    ["texto", nomeDaEmpresa ? `Planilha gerada para: ${nomeDaEmpresa}` : "Preencha as abas e envie o arquivo pelo sistema."],
    ["vazio", ""],
    ["secao", "Como funciona"],
    ["texto", "1. Cada aba e' um TIPO de equipamento (Motor, Redutor, Bomba...) - use a aba certa para cada um."],
    ["texto", "2. Nao encontrou o tipo? Use a aba \"Outros\" e escreva o tipo na coluna Tipo."],
    ["texto", "3. Colunas com * no titulo sao obrigatorias. As demais podem ficar em branco."],
    ["texto", "4. Preencha \"TAG do ativo\" so se o equipamento ja estiver instalado numa maquina - senao ele nasce em estoque."],
    ["texto", "5. O Codigo e' a identidade do equipamento: se ja existir, a linha e' ignorada (ou completada, conforme sua escolha na hora de importar)."],
    ["texto", "6. Colunas com lista fixa tem menu suspenso na celula - clique na setinha em vez de digitar."],
    ["texto", "7. Nao renomeie as abas nem as colunas, e nao apague a linha de titulo."],
    ["texto", "8. Aba que voce nao for usar pode ficar vazia - ela e' simplesmente ignorada."],
    ["vazio", ""],
    ["secao", "Ao enviar"],
    ["texto", "O sistema confere o arquivo inteiro ANTES de gravar qualquer coisa e mostra, linha a linha, o que estiver errado."],
    ["texto", "Nada e' importado enquanto voce nao confirmar."],
  ];
  for (const [tipo, texto] of linhas) {
    const linha = guia.addRow(["", texto]);
    const celula = linha.getCell(2);
    if (tipo === "titulo") { celula.font = { size: 16, bold: true, color: { argb: AZUL } }; linha.height = 26; }
    else if (tipo === "secao") { celula.font = { size: 12, bold: true }; linha.height = 22; }
    else { celula.font = { size: 11 }; celula.alignment = { wrapText: true, vertical: "top" }; }
  }

  const listasWs = wb.addWorksheet("Listas", { state: "veryHidden" });
  const intervaloDaLista = new Map<string, string>();
  let colunaDeLista = 0;
  const registrarLista = (chave: string, valores: string[]) => {
    if (valores.length === 0 || intervaloDaLista.has(chave)) return;
    colunaDeLista += 1;
    const letra = listasWs.getColumn(colunaDeLista).letter;
    listasWs.getCell(`${letra}1`).value = chave;
    valores.forEach((valor, i) => { listasWs.getCell(`${letra}${i + 2}`).value = valor; });
    intervaloDaLista.set(chave, `'Listas'!$${letra}$2:$${letra}$${valores.length + 1}`);
  };

  for (const aba of montarAbas()) {
    const colunasEspecificas = aba.campos ?? [];
    for (const campo of colunasEspecificas) {
      if (campo.opcoes) registrarLista(`campo:${aba.nome}:${campo.chave}`, campo.opcoes);
    }
  }

  for (const aba of montarAbas()) {
    const ws = wb.addWorksheet(aba.nome);
    const colunas: { chave: string; titulo: string; obrigatoria?: boolean; ajuda: string; largura?: number }[] = aba.nome === ABA_OUTROS
      ? [COLUNAS_COMUNS[0], { chave: "tipo", titulo: "Tipo*", obrigatoria: true, ajuda: "Nome do tipo do equipamento. Ex.: Painel eletrico", largura: 22 }, ...COLUNAS_COMUNS.slice(1)]
      : [...COLUNAS_COMUNS, ...(aba.campos ?? []).map((c) => ({ chave: c.chave, titulo: c.rotulo, ajuda: c.placeholder ?? "Opcional", largura: 20 }))];

    ws.columns = colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura ?? 20 }));
    const cabecalho = ws.getRow(1);
    cabecalho.height = 24;
    cabecalho.eachCell((celula, i) => {
      const coluna = colunas[i - 1];
      celula.font = { bold: true, color: { argb: "FFFFFFFF" } };
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: coluna?.obrigatoria ? AZUL : "FF6B7A8A" } };
      celula.alignment = { vertical: "middle", horizontal: "left" };
      if (coluna) celula.note = coluna.ajuda;
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const exemplo: Record<string, string | number> = { codigo: `${PREFIXO_DE_EXEMPLO[aba.nome] ?? "EQP"}-001` };
    if (aba.nome === ABA_OUTROS) exemplo.tipo = "Painel eletrico";
    const linhaExemplo = ws.addRow(exemplo);
    linhaExemplo.eachCell((celula) => {
      celula.font = { italic: true, color: { argb: "FF8A94A0" } };
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CINZA } };
    });

    if (aba.campos) {
      aba.campos.forEach((campo, i) => {
        if (!campo.opcoes) return;
        const posicao = COLUNAS_COMUNS.length + i + 1;
        const letra = ws.getColumn(posicao).letter;
        const intervalo = intervaloDaLista.get(`campo:${aba.nome}:${campo.chave}`);
        if (!intervalo) return;
        for (let linha = 2; linha <= 1000; linha += 1) {
          ws.getCell(`${letra}${linha}`).dataValidation = {
            type: "list", allowBlank: true, formulae: [intervalo], showErrorMessage: true, errorStyle: "warning",
            errorTitle: campo.rotulo, error: `Escolha um valor da lista. Aceitos: ${campo.opcoes.join(", ")}.`,
          };
        }
      });
    }
  }

  const arquivo = await wb.xlsx.writeBuffer();
  return Buffer.from(arquivo as ArrayBuffer);
}

// ---------------------------------------------------------------------------
// Leitura da planilha
// ---------------------------------------------------------------------------

type Linha = { numero: number; valores: Record<string, string> };
type Problema = { aba: string; linha: number; mensagem: string };

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

function numero(valor: string): number | null {
  if (!valor) return null;
  const limpo = valor.replace(/\s/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function colunasDaAba(aba: DefinicaoDeAbaRotable): { chave: string; titulo: string }[] {
  if (aba.nome === ABA_OUTROS) {
    return [COLUNAS_COMUNS[0], { chave: "tipo", titulo: "Tipo*" }, ...COLUNAS_COMUNS.slice(1)];
  }
  return [...COLUNAS_COMUNS, ...(aba.campos ?? []).map((c) => ({ chave: c.chave, titulo: c.rotulo }))];
}

function lerAba(wb: ExcelJS.Workbook, aba: DefinicaoDeAbaRotable): Linha[] {
  const ws = wb.getWorksheet(aba.nome);
  if (!ws) return [];
  const colunas = colunasDaAba(aba);

  const cabecalho = ws.getRow(1);
  const posicaoDaChave = new Map<number, string>();
  cabecalho.eachCell((celula, coluna) => {
    const titulo = texto(celula.value).replace(/\*/g, "").trim().toLowerCase();
    const def = colunas.find((c) => c.titulo.replace(/\*/g, "").trim().toLowerCase() === titulo);
    if (def) posicaoDaChave.set(coluna, def.chave);
  });

  const linhas: Linha[] = [];
  ws.eachRow((row, numeroDaLinha) => {
    if (numeroDaLinha === 1) return;
    const valores: Record<string, string> = {};
    for (const [coluna, chave] of posicaoDaChave) valores[chave] = texto(row.getCell(coluna).value);
    if (Object.values(valores).every((v) => !v)) return;
    linhas.push({ numero: numeroDaLinha, valores });
  });
  return linhas;
}

interface ResultadoRotable {
  simulacao: boolean;
  resumo: Record<string, { criados: number; ignorados: number; completados: number; comErro: number }>;
  problemas: Problema[];
  ignorados: { aba: string; linha: number; motivo: string }[];
  completados: { aba: string; linha: number; motivo: string }[];
}

export type ModoDeImportacaoRotable = "ignorar" | "completar";

async function processarRotable(
  wb: ExcelJS.Workbook,
  clientId: string,
  opcoes: { simular: boolean; userId?: string; modo?: ModoDeImportacaoRotable },
): Promise<ResultadoRotable> {
  const problemas: Problema[] = [];
  const ignorados: { aba: string; linha: number; motivo: string }[] = [];
  const completados: { aba: string; linha: number; motivo: string }[] = [];
  const resumo: ResultadoRotable["resumo"] = {};
  const contar = (aba: string, campo: "criados" | "ignorados" | "completados" | "comErro") => {
    resumo[aba] = resumo[aba] ?? { criados: 0, ignorados: 0, completados: 0, comErro: 0 };
    resumo[aba][campo] += 1;
  };
  const erro = (aba: string, linha: number, mensagem: string) => { problemas.push({ aba, linha, mensagem }); contar(aba, "comErro"); };

  const modo: ModoDeImportacaoRotable = opcoes.modo ?? "ignorar";

  // Codigos ja usados nesta empresa + os que forem criados nesta propria planilha (para
  // acusar repeticao DENTRO do arquivo, nao so contra o banco).
  const existentes = new Map<
    string,
    { id: string; manufacturer: string | null; model: string | null; serialNumber: string | null; acquisitionCost: number | null; notes: string | null; specificAttributes: Record<string, string> | null }
  >();
  for (const r of await prisma.rotableEquipment.findMany({
    where: { clientId, deletedAt: null },
    select: { id: true, code: true, manufacturer: true, model: true, serialNumber: true, acquisitionCost: true, notes: true, specificAttributes: true },
  })) {
    existentes.set(r.code.trim().toLowerCase(), { id: r.id, manufacturer: r.manufacturer, model: r.model, serialNumber: r.serialNumber, acquisitionCost: r.acquisitionCost, notes: r.notes, specificAttributes: (r.specificAttributes as Record<string, string> | null) ?? null });
  }
  const codigosNestaPlanilha = new Set<string>();

  const instrumentos = new Map<string, { id: string; ocupadoPor: string | null }>();
  for (const i of await prisma.instrument.findMany({ where: { clientId, deletedAt: null }, select: { id: true, tag: true } })) {
    if (i.tag) instrumentos.set(i.tag.trim().toLowerCase(), { id: i.id, ocupadoPor: null });
  }
  for (const r of await prisma.rotableEquipment.findMany({ where: { clientId, deletedAt: null, currentInstrumentId: { not: null } }, select: { code: true, currentInstrumentId: true } })) {
    for (const inst of instrumentos.values()) if (inst.id === r.currentInstrumentId) inst.ocupadoPor = r.code;
  }
  const posicoesOcupadasNestaPlanilha = new Set<string>();

  for (const aba of montarAbas()) {
    const linhas = lerAba(wb, aba);
    for (const linha of linhas) {
      const codigo = linha.valores.codigo?.trim();
      if (!codigo) { erro(aba.nome, linha.numero, "Codigo e' obrigatorio."); continue; }
      const chaveCodigo = codigo.toLowerCase();

      const tipo = aba.nome === ABA_OUTROS ? linha.valores.tipo?.trim() : aba.nome;
      if (aba.nome === ABA_OUTROS && !tipo) { erro(aba.nome, linha.numero, "Tipo e' obrigatorio na aba Outros."); continue; }

      if (codigosNestaPlanilha.has(chaveCodigo)) {
        erro(aba.nome, linha.numero, `Codigo "${codigo}" repetido dentro da propria planilha.`);
        continue;
      }

      const custo = linha.valores.custoDeAquisicao ? numero(linha.valores.custoDeAquisicao) : null;
      if (linha.valores.custoDeAquisicao && custo == null) { erro(aba.nome, linha.numero, `Custo de aquisicao invalido: "${linha.valores.custoDeAquisicao}".`); continue; }

      let instrumentoAlvo: { id: string; ocupadoPor: string | null } | undefined;
      const tagInformado = linha.valores.tagDoAtivo?.trim();
      if (tagInformado) {
        instrumentoAlvo = instrumentos.get(tagInformado.toLowerCase());
        if (!instrumentoAlvo) { erro(aba.nome, linha.numero, `Ativo com TAG "${tagInformado}" nao encontrado.`); continue; }
        if (instrumentoAlvo.ocupadoPor && instrumentoAlvo.ocupadoPor !== codigo) {
          erro(aba.nome, linha.numero, `O ativo "${tagInformado}" ja tem o equipamento ${instrumentoAlvo.ocupadoPor} instalado.`);
          continue;
        }
        if (posicoesOcupadasNestaPlanilha.has(tagInformado.toLowerCase())) {
          erro(aba.nome, linha.numero, `O ativo "${tagInformado}" ja foi usado por outra linha desta planilha.`);
          continue;
        }
      }

      const specificAttributes: Record<string, string> = {};
      if (aba.campos) {
        for (const campo of aba.campos) {
          const valor = linha.valores[campo.chave]?.trim();
          if (valor) specificAttributes[campo.chave] = valor;
        }
      }

      const jaExiste = existentes.get(chaveCodigo);
      if (jaExiste) {
        if (modo === "ignorar") {
          ignorados.push({ aba: aba.nome, linha: linha.numero, motivo: `Codigo "${codigo}" ja cadastrado - nada foi alterado.` });
          contar(aba.nome, "ignorados");
          codigosNestaPlanilha.add(chaveCodigo);
          continue;
        }

        // completar: so' preenche o que estiver vazio no sistema, nunca troca valor gravado.
        const dados: Record<string, unknown> = {};
        const camposCompletados: string[] = [];
        const completar = (campoDb: string, atual: unknown, novo: string | null | undefined, rotulo: string) => {
          if (!atual && novo) { dados[campoDb] = novo; camposCompletados.push(rotulo); }
        };
        completar("manufacturer", jaExiste.manufacturer, linha.valores.fabricante, "fabricante");
        completar("model", jaExiste.model, linha.valores.modelo, "modelo");
        completar("serialNumber", jaExiste.serialNumber, linha.valores.numeroDeSerie, "numero de serie");
        completar("notes", jaExiste.notes, linha.valores.observacoes, "observacoes");
        if (jaExiste.acquisitionCost == null && custo != null) { dados.acquisitionCost = custo; camposCompletados.push("custo de aquisicao"); }

        const attrsFaltando: Record<string, string> = {};
        for (const [chave, valor] of Object.entries(specificAttributes)) {
          if (!jaExiste.specificAttributes?.[chave]) { attrsFaltando[chave] = valor; camposCompletados.push(chave); }
        }
        if (Object.keys(attrsFaltando).length > 0) {
          dados.specificAttributes = { ...(jaExiste.specificAttributes ?? {}), ...attrsFaltando };
        }

        if (camposCompletados.length === 0) {
          ignorados.push({ aba: aba.nome, linha: linha.numero, motivo: `Codigo "${codigo}" ja cadastrado, sem nada novo para completar.` });
          contar(aba.nome, "ignorados");
        } else {
          completados.push({ aba: aba.nome, linha: linha.numero, motivo: `Codigo "${codigo}": completado ${camposCompletados.join(", ")}.` });
          contar(aba.nome, "completados");
          if (!opcoes.simular) {
            await prisma.rotableEquipment.update({ where: { id: jaExiste.id }, data: dados });
          }
        }
        codigosNestaPlanilha.add(chaveCodigo);
        continue;
      }

      codigosNestaPlanilha.add(chaveCodigo);
      if (instrumentoAlvo) posicoesOcupadasNestaPlanilha.add(tagInformado!.toLowerCase());
      contar(aba.nome, "criados");

      if (!opcoes.simular) {
        const criado = await prisma.rotableEquipment.create({
          data: {
            clientId,
            code: codigo,
            type: tipo!,
            manufacturer: linha.valores.fabricante || null,
            model: linha.valores.modelo || null,
            serialNumber: linha.valores.numeroDeSerie || null,
            specificAttributes: Object.keys(specificAttributes).length > 0 ? specificAttributes : undefined,
            acquisitionCost: custo,
            notes: linha.valores.observacoes || null,
            status: instrumentoAlvo ? "INSTALLED" : "IN_STOCK",
            currentInstrumentId: instrumentoAlvo?.id ?? null,
            createdById: opcoes.userId,
          },
        });
        if (instrumentoAlvo) {
          await prisma.rotableInstallation.create({
            data: { rotableId: criado.id, instrumentId: instrumentoAlvo.id, installedById: opcoes.userId, notes: "Instalado via importacao por planilha." },
          });
          await recalcularCriticidade(instrumentoAlvo.id, "EQUIPMENT_MOVED");
        }
      }
    }
  }

  return { simulacao: opcoes.simular, resumo, problemas, ignorados, completados };
}

async function abrirPlanilhaRotable(req: Request): Promise<ExcelJS.Workbook> {
  const file = req.file;
  if (!file) throw new ValidationError("Selecione a planilha preenchida.");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError("Nao foi possivel ler o arquivo. Envie o modelo em .xlsx, sem converter para outro formato.");
  }
  const conhecidas = montarAbas().map((a) => a.nome);
  if (!wb.worksheets.some((ws) => conhecidas.includes(ws.name))) {
    throw new ValidationError(`Este arquivo nao tem nenhuma das abas esperadas (${conhecidas.join(", ")}). Baixe o modelo e preencha sobre ele.`);
  }
  return wb;
}

export const simularImportacaoRotable = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const clientId = resolveClientId(req, (req.body as { clientId?: string })?.clientId);
  const cliente = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true } });
  if (!cliente) throw new NotFoundError("Cliente");

  const wb = await abrirPlanilhaRotable(req);
  const modo = (req.body as { modo?: ModoDeImportacaoRotable })?.modo === "completar" ? "completar" : "ignorar";
  const resultado = await processarRotable(wb, clientId, { simular: true, userId: req.user?.sub, modo });
  res.json(resultado);
});

export const confirmarImportacaoRotable = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const clientId = resolveClientId(req, (req.body as { clientId?: string })?.clientId);
  const cliente = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, companyName: true } });
  if (!cliente) throw new NotFoundError("Cliente");

  const wb = await abrirPlanilhaRotable(req);

  const conferencia = await processarRotable(wb, clientId, { simular: true, userId: req.user?.sub });
  if (conferencia.problemas.length > 0) {
    throw new ValidationError(`A planilha tem ${conferencia.problemas.length} erro(s) - corrija e envie de novo. Nada foi importado.`);
  }

  const modo = (req.body as { modo?: ModoDeImportacaoRotable })?.modo === "completar" ? "completar" : "ignorar";
  const resultado = await processarRotable(wb, clientId, { simular: false, userId: req.user?.sub, modo });

  const total = Object.values(resultado.resumo).reduce((soma, r) => soma + r.criados, 0);
  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "Client",
    entityId: clientId,
    description: `Importacao de equipamentos recondicionaveis por planilha: ${total} registro(s) criado(s) em ${cliente.companyName}`,
  });

  res.status(201).json(resultado);
});

// ---------------------------------------------------------------------------
// Exportacao
// ---------------------------------------------------------------------------

export const exportarRotable = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const clientId = resolveClientId(req, (req.query as { clientId?: string })?.clientId);
  const cliente = await prisma.client.findFirst({ where: { id: clientId, deletedAt: null }, select: { id: true, companyName: true } });
  if (!cliente) throw new NotFoundError("Cliente");

  const equipamentos = await prisma.rotableEquipment.findMany({
    where: { clientId, deletedAt: null },
    include: { currentInstrument: { select: { tag: true, description: true } } },
    orderBy: [{ type: "asc" }, { code: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "RLP Maintenance CMMS";
  wb.created = new Date();

  const porAba = new Map<string, typeof equipamentos>();
  for (const eq of equipamentos) {
    const padrao = tipoPadraoDoNome(eq.type);
    const nomeDaAba = padrao?.nome ?? ABA_OUTROS;
    if (!porAba.has(nomeDaAba)) porAba.set(nomeDaAba, []);
    porAba.get(nomeDaAba)!.push(eq);
  }

  const STATUS_LABELS: Record<string, string> = {
    IN_STOCK: "Em estoque", INSTALLED: "Instalado", QUARANTINE: "Quarentena", IN_RECONDITIONING: "Em reparo", SCRAPPED: "Sucateado",
  };

  for (const aba of montarAbas()) {
    const linhas = porAba.get(aba.nome);
    if (!linhas || linhas.length === 0) continue;

    const ws = wb.addWorksheet(aba.nome);
    const colunasBase = aba.nome === ABA_OUTROS
      ? [COLUNAS_COMUNS[0], { chave: "tipo", titulo: "Tipo", largura: 22 }, ...COLUNAS_COMUNS.slice(1)]
      : [...COLUNAS_COMUNS, ...(aba.campos ?? []).map((c) => ({ chave: c.chave, titulo: c.rotulo, largura: 20 }))];
    const colunas = [
      ...colunasBase,
      { chave: "status", titulo: "Status", largura: 16 },
      { chave: "instaladoEm", titulo: "Instalado em (TAG)", largura: 24 },
      { chave: "cadastradoEm", titulo: "Cadastrado em", largura: 16 },
    ];

    ws.columns = colunas.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura ?? 20 }));
    const cabecalho = ws.getRow(1);
    cabecalho.height = 22;
    cabecalho.eachCell((celula) => {
      celula.font = { bold: true, color: { argb: "FFFFFFFF" } };
      celula.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];

    for (const eq of linhas) {
      const attrs = (eq.specificAttributes as Record<string, string> | null) ?? {};
      ws.addRow({
        codigo: eq.code,
        ...(aba.nome === ABA_OUTROS ? { tipo: eq.type } : {}),
        fabricante: eq.manufacturer ?? "",
        modelo: eq.model ?? "",
        numeroDeSerie: eq.serialNumber ?? "",
        tagDoAtivo: eq.currentInstrument?.tag ?? "",
        custoDeAquisicao: eq.acquisitionCost ?? "",
        observacoes: eq.notes ?? "",
        ...Object.fromEntries((aba.campos ?? []).map((c) => [c.chave, attrs[c.chave] ?? ""])),
        status: STATUS_LABELS[eq.status] ?? eq.status,
        instaladoEm: eq.currentInstrument?.tag ?? eq.currentInstrument?.description ?? "",
        cadastradoEm: eq.createdAt.toLocaleDateString("pt-BR"),
      });
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet("Equipamentos");
    ws.addRow(["Nenhum equipamento recondicionavel cadastrado ainda."]);
  }

  const arquivo = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="equipamentos-recondicionaveis-${cliente.companyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.xlsx"`);
  res.end(Buffer.from(arquivo as ArrayBuffer));
});
