export interface CampoEspecifico {
  /** Chave gravada em specificAttributes - estavel, nao muda mesmo se o rotulo mudar. */
  chave: string;
  rotulo: string;
  placeholder?: string;
  /** "text" cobre numero com unidade junto (ex.: "15 cv") - mais simples que campo numerico
   * mais campo de unidade separado, e cobre o jeito que a equipe ja preenche isso hoje. */
  tipo?: "text" | "select";
  opcoes?: string[];
}

/**
 * Campos tecnicos por tipo de ativo, para a aba Visao geral.
 *
 * O catalogo de "Tipo de ativo" e' aberto - cada cliente cadastra os proprios tipos - entao
 * nao da para guardar "quais campos" no banco, por tipo, sem uma tela de configuracao
 * inteira. Este mapa cobre os tipos industriais mais comuns pelo nome; um tipo fora daqui
 * (ou um tipo customizado do cliente) simplesmente nao mostra campos extras - o ativo
 * continua funcionando normalmente, so sem a ficha tecnica adicional.
 */
const CAMPOS_POR_TIPO: Record<string, CampoEspecifico[]> = {
  motor: [
    { chave: "potencia", rotulo: "Potencia", placeholder: "Ex.: 15 cv / 11 kw" },
    { chave: "tensao", rotulo: "Tensao", placeholder: "Ex.: 380V" },
    { chave: "correnteNominal", rotulo: "Corrente nominal", placeholder: "Ex.: 24 A" },
    { chave: "rotacao", rotulo: "Rotacao", placeholder: "Ex.: 1750 rpm" },
    { chave: "carcaca", rotulo: "Carcaca (frame)", placeholder: "Ex.: 132M" },
    { chave: "fatorDeServico", rotulo: "Fator de servico", placeholder: "Ex.: 1.15" },
  ],
  redutor: [
    { chave: "relacaoDeReducao", rotulo: "Relacao de reducao", placeholder: "Ex.: 1:20" },
    { chave: "torqueNominal", rotulo: "Torque nominal", placeholder: "Ex.: 450 Nm" },
    { chave: "tipoDeOleo", rotulo: "Tipo de oleo", placeholder: "Ex.: ISO VG 220" },
    { chave: "capacidadeDeOleo", rotulo: "Capacidade de oleo", placeholder: "Ex.: 2.5 L" },
  ],
  extrusora: [
    { chave: "diametroDoParafuso", rotulo: "Diametro do parafuso", placeholder: "Ex.: 90 mm" },
    { chave: "relacaoLD", rotulo: "Relacao L/D", placeholder: "Ex.: 28:1" },
    { chave: "zonasDeAquecimento", rotulo: "Zonas de aquecimento", placeholder: "Ex.: 6" },
    { chave: "capacidadeDeProducao", rotulo: "Capacidade de producao", placeholder: "Ex.: 250 kg/h" },
  ],
  rolo: [
    { chave: "diametro", rotulo: "Diametro", placeholder: "Ex.: 200 mm" },
    { chave: "comprimento", rotulo: "Comprimento", placeholder: "Ex.: 1200 mm" },
    { chave: "materialDoRevestimento", rotulo: "Material do revestimento", placeholder: "Ex.: Borracha nitrilica" },
    { chave: "temperaturaDeTrabalho", rotulo: "Temperatura de trabalho", placeholder: "Ex.: ate 80 C" },
  ],
  bomba: [
    { chave: "vazao", rotulo: "Vazao", placeholder: "Ex.: 12 m3/h" },
    { chave: "pressao", rotulo: "Pressao", placeholder: "Ex.: 4 bar" },
    {
      chave: "tipoDeBomba",
      rotulo: "Tipo",
      tipo: "select",
      opcoes: ["Centrifuga", "Deslocamento positivo", "Diafragma", "Outra"],
    },
  ],
  compressor: [
    { chave: "pressaoDeTrabalho", rotulo: "Pressao de trabalho", placeholder: "Ex.: 8 bar" },
    { chave: "capacidade", rotulo: "Capacidade", placeholder: "Ex.: 10 m3/min" },
    { chave: "tipoDeCompressor", rotulo: "Tipo", tipo: "select", opcoes: ["Parafuso", "Piston", "Centrifugo", "Outro"] },
  ],
  valvula: [
    { chave: "diametroNominal", rotulo: "Diametro nominal (DN)", placeholder: "Ex.: DN50" },
    { chave: "tipoDeValvula", rotulo: "Tipo", tipo: "select", opcoes: ["Gaveta", "Esfera", "Borboleta", "Globo", "Retencao", "Outra"] },
    { chave: "materialDoCorpo", rotulo: "Material do corpo", placeholder: "Ex.: Ferro fundido" },
  ],
  "painel eletrico": [
    { chave: "tensaoDeAlimentacao", rotulo: "Tensao de alimentacao", placeholder: "Ex.: 380V" },
    { chave: "correnteDoDisjuntorGeral", rotulo: "Corrente do disjuntor geral", placeholder: "Ex.: 63 A" },
    { chave: "grauDeProtecao", rotulo: "Grau de protecao (IP)", placeholder: "Ex.: IP54" },
  ],
  "correia transportadora": [
    { chave: "comprimento", rotulo: "Comprimento", placeholder: "Ex.: 15 m" },
    { chave: "largura", rotulo: "Largura", placeholder: "Ex.: 600 mm" },
    { chave: "velocidade", rotulo: "Velocidade", placeholder: "Ex.: 1.2 m/min" },
  ],
  "trocador de calor": [
    {
      chave: "tipoDeTrocador",
      rotulo: "Tipo",
      tipo: "select",
      opcoes: ["Casco e tubo", "Placas", "Ar/oleo", "Outro"],
    },
    { chave: "areaDeTroca", rotulo: "Area de troca termica", placeholder: "Ex.: 12 m2" },
    { chave: "fluidoQuente", rotulo: "Fluido quente", placeholder: "Ex.: Oleo hidraulico" },
    { chave: "fluidoFrio", rotulo: "Fluido frio", placeholder: "Ex.: Agua" },
    { chave: "pressaoDeProjeto", rotulo: "Pressao de projeto", placeholder: "Ex.: 10 bar" },
  ],
};

/** Sem acento, sem espaco duplicado, minusculo - "Motor Eletrico" e "motor" batem no mesmo
 * conjunto de campos, mas "Motor" e "Redutor" continuam sendo tipos diferentes. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Acha o conjunto de campos cujo nome bate com o tipo do ativo (correspondencia parcial:
 * "Motor eletrico trifasico" casa com "motor"). Retorna vazio quando o tipo nao e' conhecido. */
export function camposDoTipo(tipo: string | null | undefined): CampoEspecifico[] {
  if (!tipo) return [];
  const alvo = normalizar(tipo);
  for (const [chave, campos] of Object.entries(CAMPOS_POR_TIPO)) {
    if (alvo.includes(chave)) return campos;
  }
  return [];
}
