/**
 * Espelho de frontend/src/lib/camposPorTipoDeAtivo.ts - mesmas chaves, mesmos rotulos.
 *
 * Repo nao compartilha codigo entre backend e frontend (bundlers diferentes), entao esta
 * copia existe so' para a planilha de importacao/exportacao saber quais colunas por tipo
 * gerar e onde gravar cada uma em specificAttributes. Se um campo mudar aqui, muda la' -
 * senao a ficha tecnica da tela nao reconhece o que a planilha gravou.
 */
export interface CampoEspecifico {
  chave: string;
  rotulo: string;
  placeholder?: string;
  opcoes?: string[];
}

export interface TipoPadrao {
  /** Nome exato do catalogo de tipos (AssetType) - vira nome da aba na planilha. */
  nome: string;
  campos: CampoEspecifico[];
}

export const TIPOS_PADRAO: TipoPadrao[] = [
  {
    nome: "Motor",
    campos: [
      { chave: "potencia", rotulo: "Potencia", placeholder: "Ex.: 15 cv / 11 kw" },
      { chave: "tensao", rotulo: "Tensao", placeholder: "Ex.: 380V" },
      { chave: "correnteNominal", rotulo: "Corrente nominal", placeholder: "Ex.: 24 A" },
      { chave: "rotacao", rotulo: "Rotacao", placeholder: "Ex.: 1750 rpm" },
      { chave: "carcaca", rotulo: "Carcaca (frame)", placeholder: "Ex.: 132M" },
      { chave: "fatorDeServico", rotulo: "Fator de servico", placeholder: "Ex.: 1.15" },
    ],
  },
  {
    nome: "Redutor",
    campos: [
      { chave: "relacaoDeReducao", rotulo: "Relacao de reducao", placeholder: "Ex.: 1:20" },
      { chave: "torqueNominal", rotulo: "Torque nominal", placeholder: "Ex.: 450 Nm" },
      { chave: "tipoDeOleo", rotulo: "Tipo de oleo", placeholder: "Ex.: ISO VG 220" },
      { chave: "capacidadeDeOleo", rotulo: "Capacidade de oleo", placeholder: "Ex.: 2.5 L" },
    ],
  },
  {
    nome: "Bomba de vácuo",
    campos: [
      { chave: "tipoDeBombaDeVacuo", rotulo: "Tipo", opcoes: ["Palhetas", "Anel liquido", "Lobulos (Roots)", "Parafuso", "Diafragma", "Outro"] },
      { chave: "vazaoDeSuccao", rotulo: "Vazao de succao", placeholder: "Ex.: 40 m3/h" },
      { chave: "nivelDeVacuo", rotulo: "Nivel de vacuo", placeholder: "Ex.: 0.5 mbar" },
      { chave: "potencia", rotulo: "Potencia", placeholder: "Ex.: 5.5 cv" },
    ],
  },
  {
    nome: "Bomba",
    campos: [
      { chave: "vazao", rotulo: "Vazao", placeholder: "Ex.: 12 m3/h" },
      { chave: "pressao", rotulo: "Pressao", placeholder: "Ex.: 4 bar" },
      { chave: "tipoDeBomba", rotulo: "Tipo", opcoes: ["Centrifuga", "Deslocamento positivo", "Diafragma", "Outra"] },
    ],
  },
  {
    nome: "Rolo",
    campos: [
      { chave: "diametro", rotulo: "Diametro", placeholder: "Ex.: 200 mm" },
      { chave: "comprimento", rotulo: "Comprimento", placeholder: "Ex.: 1200 mm" },
      { chave: "materialDoRevestimento", rotulo: "Material do revestimento", placeholder: "Ex.: Borracha nitrilica" },
      { chave: "temperaturaDeTrabalho", rotulo: "Temperatura de trabalho", placeholder: "Ex.: ate 80 C" },
    ],
  },
  {
    nome: "Unidade compressora",
    campos: [
      { chave: "pressaoDeTrabalho", rotulo: "Pressao de trabalho", placeholder: "Ex.: 8 bar" },
      { chave: "capacidade", rotulo: "Capacidade", placeholder: "Ex.: 10 m3/min" },
      { chave: "tipoDeCompressor", rotulo: "Tipo", opcoes: ["Parafuso", "Piston", "Centrifugo", "Outro"] },
    ],
  },
  {
    nome: "Trocador de calor",
    campos: [
      { chave: "tipoDeTrocador", rotulo: "Tipo", opcoes: ["Casco e tubo", "Placas", "Ar/oleo", "Outro"] },
      { chave: "areaDeTroca", rotulo: "Area de troca termica", placeholder: "Ex.: 12 m2" },
      { chave: "fluidoQuente", rotulo: "Fluido quente", placeholder: "Ex.: Oleo hidraulico" },
      { chave: "fluidoFrio", rotulo: "Fluido frio", placeholder: "Ex.: Agua" },
      { chave: "pressaoDeProjeto", rotulo: "Pressao de projeto", placeholder: "Ex.: 10 bar" },
    ],
  },
];

/** Sem acento, minusculo, sem espaco duplicado - mesma normalizacao do frontend, para o tipo
 * digitado/escolhido casar com a aba certa independente de acentuacao. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Acha a definicao de tipo padrao cujo nome bate com o tipo do equipamento (correspondencia
 * parcial, igual ao frontend: "Motor eletrico trifasico" casa com "Motor"). */
export function tipoPadraoDoNome(tipo: string | null | undefined): TipoPadrao | null {
  if (!tipo) return null;
  const alvo = normalizar(tipo);
  for (const padrao of TIPOS_PADRAO) {
    if (alvo.includes(normalizar(padrao.nome))) return padrao;
  }
  return null;
}
