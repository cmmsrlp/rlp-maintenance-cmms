import type { Prisma, CriticalityChangeTrigger, CriticalityClass, CriticalityOrigin, CriticalityTrend } from "@prisma/client";
import { prisma } from "./prisma";
import { addMonths } from "./dateMath";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * Nota de falhas (Q, 1-5) pela razao entre o MTBF real do ativo e o MTBF-meta (horas
 * esperadas entre falhas). Quanto mais o MTBF real fica ABAIXO da meta, pior a nota -
 * razao alta (ativo dura mais que o esperado) da nota baixa, razao baixa (quebra bem antes
 * do esperado) da nota alta.
 */
function notaPorRazaoMtbf(razao: number): number {
  if (razao >= 1.25) return 1;
  if (razao >= 1.0) return 2;
  if (razao >= 0.75) return 3;
  if (razao >= 0.5) return 4;
  return 5;
}

/**
 * Fallback por contagem de falhas, usado so' quando NAO da pra montar a razao MTBF real/meta
 * (sem medidor de horas no ativo, e sem media de familia disponivel ainda). Mais falhas no
 * periodo sempre significa pior nota, mesmo sem MTBF-meta definido.
 */
function notaPorContagemLegado(falhas12m: number): number {
  if (falhas12m <= 0) return 1;
  if (falhas12m === 1) return 2;
  if (falhas12m === 2) return 3;
  if (falhas12m === 3) return 4;
  return 5;
}

/**
 * MTBF-meta a usar na razao: a meta propria do ativo (definida a mao ou por importacao),
 * ou, na falta dela, a media do MTBF real dos outros ativos da mesma familia (mesmo
 * Instrument.type, mesmo cliente) que ja tem MTBF calculado. Sem meta propria e sem familia
 * com dado nenhum, retorna null - af calculo cai no fallback por contagem.
 */
export async function resolverMtbfMeta(db: Db, instrumentId: string, metaPropria: number | null | undefined): Promise<number | null> {
  if (metaPropria != null) return metaPropria;

  const instrumento = await db.instrument.findFirst({ where: { id: instrumentId, deletedAt: null }, select: { type: true, clientId: true } });
  if (!instrumento) return null;

  const familia = await db.assetCriticality.findMany({
    where: {
      clientId: instrumento.clientId,
      instrumentId: { not: instrumentId },
      mtbfHours: { not: null },
      instrument: { type: instrumento.type, deletedAt: null },
    },
    select: { mtbfHours: true },
  });
  if (familia.length === 0) return null;

  const soma = familia.reduce((acc, f) => acc + (f.mtbfHours ?? 0), 0);
  return soma / familia.length;
}

function classeDaCriticidade(indice: number): CriticalityClass {
  if (indice >= 60) return "A";
  if (indice >= 25) return "B";
  return "C";
}

interface DadosDeFalha {
  falhas12m: number;
  horasOperadas12m: number | null;
  mtbfHoras: number | null;
  temHistoricoSuficiente: boolean;
}

/**
 * Busca o que alimenta Q: falhas funcionais concluidas nos ultimos 12 meses e horas
 * operadas no mesmo periodo (via medidor tipo horimetro/contador do ativo, quando existe).
 * "Historico suficiente" exige pelo menos UM dos dois sinais (falha registrada OU medidor
 * de horas) - sem nenhum dos dois nao ha base nenhuma pra julgar, e a tela mostra "Dados
 * insuficientes" em vez de inventar uma nota.
 */
async function buscarDadosDeFalha(db: Db, instrumentId: string): Promise<DadosDeFalha> {
  const corte = addMonths(new Date(), -12);

  const [falhas12m, existeFalhaAlgumDia, contador] = await Promise.all([
    db.maintenanceWorkOrder.count({
      where: {
        instrumentId,
        type: "CORRECTIVE",
        correctiveType: "BREAKDOWN",
        status: "COMPLETED",
        deletedAt: null,
        completedAt: { gte: corte },
      },
    }),
    db.maintenanceWorkOrder.count({
      where: { instrumentId, type: "CORRECTIVE", correctiveType: "BREAKDOWN", status: "COMPLETED", deletedAt: null },
      take: 1,
    }),
    db.meter.findFirst({
      where: { instrumentId, technique: "COUNTER", deletedAt: null },
      select: { id: true, currentValue: true },
    }),
  ]);

  let horasOperadas12m: number | null = null;
  if (contador) {
    const leituras = await db.meterReading.findMany({
      where: { meterId: contador.id, readAt: { gte: corte } },
      orderBy: { readAt: "asc" },
      select: { value: true },
    });
    if (leituras.length >= 2) {
      const primeira = leituras[0].value;
      const ultima = leituras[leituras.length - 1].value;
      horasOperadas12m = Math.max(0, ultima - primeira);
    }
  }

  const mtbfHoras = horasOperadas12m != null && falhas12m > 0 ? horasOperadas12m / falhas12m : null;
  const temHistoricoSuficiente = existeFalhaAlgumDia > 0 || horasOperadas12m != null;

  return { falhas12m, horasOperadas12m, mtbfHoras, temHistoricoSuficiente };
}

/**
 * Recalcula a criticidade de um ativo (local funcional) e grava um retrato no historico.
 * Cria a linha de AssetCriticality na primeira vez (S/P nascem em 1 - alguem ainda precisa
 * revisar). So mexe em Q quando a origem continua AUTO; uma nota de falha sobrescrita a
 * mao (origin MANUAL) fica intocada ate a pessoa reverter pra automatica.
 */
export async function recalcularCriticidade(
  instrumentId: string,
  trigger: CriticalityChangeTrigger,
  opts: { db?: Db; responsibleId?: string; reason?: string } = {},
) {
  const db = opts.db ?? prisma;

  const instrument = await db.instrument.findFirst({ where: { id: instrumentId, deletedAt: null }, select: { id: true, clientId: true } });
  if (!instrument) return null;

  const existente = await db.assetCriticality.findUnique({ where: { instrumentId } });
  const dados = await buscarDadosDeFalha(db, instrumentId);

  let novaNotaAuto: number | null = null;
  if (dados.temHistoricoSuficiente) {
    if (dados.falhas12m <= 0) {
      // Sem nenhuma falha no periodo (com sinal de operacao) e' o melhor cenario possivel -
      // nao precisa de MTBF-meta pra saber que a nota e' 1.
      novaNotaAuto = 1;
    } else if (dados.mtbfHoras != null) {
      const meta = await resolverMtbfMeta(db, instrumentId, existente?.mtbfTargetHours);
      novaNotaAuto = meta != null && meta > 0 ? notaPorRazaoMtbf(dados.mtbfHoras / meta) : notaPorContagemLegado(dados.falhas12m);
    } else {
      // Teve falha mas nao ha medidor de horas pra montar MTBF - so' sobra a contagem.
      novaNotaAuto = notaPorContagemLegado(dados.falhas12m);
    }
  }
  const origemAtual = existente?.failureScoreOrigin ?? "AUTO";
  const failureScore = origemAtual === "MANUAL" ? (existente?.failureScore ?? null) : novaNotaAuto;

  const safetyScore = existente?.safetyScore ?? 1;
  const productionScore = existente?.productionScore ?? 1;
  const consequenceScore = Math.max(safetyScore, productionScore);

  let criticalityIndex: number | null = null;
  if (failureScore != null) {
    criticalityIndex = 4 * consequenceScore * failureScore;
  }
  // Regra explicita e independente do calculo de Q: Seguranca 4/5 ou Producao 5 sempre e'
  // Classe A - inclusive SEM historico de falha ainda (um ativo de alto risco nao pode
  // aparecer como "dados insuficientes" so porque nunca quebrou). So sem essa regra a classe
  // depende do indice, que por sua vez exige Q (senao fica "dados insuficientes" mesmo).
  const criticalityClass: CriticalityClass | null =
    safetyScore >= 4 || productionScore === 5 ? "A" : criticalityIndex != null ? classeDaCriticidade(criticalityIndex) : null;

  const anterior = existente?.failureScore ?? null;
  let trend: CriticalityTrend | null = null;
  if (failureScore != null && anterior != null) {
    trend = failureScore > anterior ? "UP" : failureScore < anterior ? "DOWN" : "STABLE";
  }

  const atualizado = await db.assetCriticality.upsert({
    where: { instrumentId },
    create: {
      instrumentId,
      clientId: instrument.clientId,
      safetyScore: 1,
      productionScore: 1,
      failureScore,
      failureScoreOrigin: "AUTO",
      previousFailureScore: null,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
      trend: null,
      mtbfHours: dados.mtbfHoras,
      failureCount12m: dados.falhas12m,
      operatingHours12m: dados.horasOperadas12m,
      lastCalculatedAt: new Date(),
    },
    update: {
      failureScore,
      previousFailureScore: origemAtual === "AUTO" ? anterior : existente?.previousFailureScore,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
      trend,
      mtbfHours: dados.mtbfHoras,
      failureCount12m: dados.falhas12m,
      operatingHours12m: dados.horasOperadas12m,
      lastCalculatedAt: new Date(),
    },
  });

  await db.assetCriticalityLog.create({
    data: {
      criticalityId: atualizado.id,
      trigger,
      origin: "AUTO",
      safetyScore: atualizado.safetyScore,
      productionScore: atualizado.productionScore,
      failureScore: atualizado.failureScore,
      criticalityIndex: atualizado.criticalityIndex,
      criticalityClass: atualizado.criticalityClass,
      reason: opts.reason ?? null,
      responsibleId: opts.responsibleId ?? null,
    },
  });

  return atualizado;
}

export interface RevisaoManualInput {
  safetyScore?: number;
  safetyNotes?: string | null;
  productionScore?: number;
  productionNotes?: string | null;
  // "AUTO" volta o calculo automatico a mandar em Q; "MANUAL" exige failureScore + reason.
  failureScoreMode?: "AUTO" | "MANUAL";
  failureScore?: number | null;
  // undefined = nao mexe na meta gravada; null explicito = limpa (volta a usar a familia).
  mtbfTargetHours?: number | null;
  reason?: string;
  responsibleId?: string;
  trigger?: CriticalityChangeTrigger;
}

/**
 * Revisao manual de S/P (sempre manual) e, opcionalmente, do MTBF-meta e/ou sobrescrita de
 * Q. Usada tanto pela revisao individual (tela do ativo) quanto pela importacao em massa por
 * planilha - as duas fazem exatamente a mesma coisa, so' muda de onde vem o dado.
 */
export async function revisarCriticidade(db: Db, instrumentId: string, clientId: string, data: RevisaoManualInput) {
  const existente = await db.assetCriticality.findUnique({ where: { instrumentId } });
  const agora = new Date();

  const safetyScore = data.safetyScore ?? existente?.safetyScore ?? 1;
  const productionScore = data.productionScore ?? existente?.productionScore ?? 1;
  const consequenceScore = Math.max(safetyScore, productionScore);

  let failureScore = existente?.failureScore ?? null;
  let failureScoreOrigin: CriticalityOrigin = existente?.failureScoreOrigin ?? "AUTO";
  let failureOverrideReason = existente?.failureOverrideReason ?? null;
  let failureOverrideAt = existente?.failureOverrideAt ?? null;

  if (data.failureScoreMode === "MANUAL") {
    failureScore = data.failureScore!;
    failureScoreOrigin = "MANUAL";
    failureOverrideReason = data.reason ?? null;
    failureOverrideAt = agora;
  } else if (data.failureScoreMode === "AUTO") {
    failureScoreOrigin = "AUTO";
    failureOverrideReason = null;
    failureOverrideAt = null;
  }

  let criticalityIndex: number | null = null;
  if (failureScoreOrigin === "MANUAL" && failureScore != null) {
    criticalityIndex = 4 * consequenceScore * failureScore;
  }
  const criticalityClass: CriticalityClass | null =
    safetyScore >= 4 || productionScore === 5 ? "A" : criticalityIndex != null ? classeDaCriticidade(criticalityIndex) : null;

  await db.assetCriticality.upsert({
    where: { instrumentId },
    create: {
      instrumentId,
      clientId,
      safetyScore,
      safetyNotes: data.safetyNotes ?? null,
      safetyUpdatedAt: data.safetyScore != null ? agora : null,
      productionScore,
      productionNotes: data.productionNotes ?? null,
      productionUpdatedAt: data.productionScore != null ? agora : null,
      failureScore,
      failureScoreOrigin,
      failureOverrideReason,
      failureOverrideAt,
      consequenceScore,
      criticalityIndex,
      criticalityClass,
      mtbfTargetHours: data.mtbfTargetHours ?? null,
    },
    update: {
      safetyScore,
      ...(data.safetyNotes !== undefined ? { safetyNotes: data.safetyNotes } : {}),
      ...(data.safetyScore != null ? { safetyUpdatedAt: agora } : {}),
      productionScore,
      ...(data.productionNotes !== undefined ? { productionNotes: data.productionNotes } : {}),
      ...(data.productionScore != null ? { productionUpdatedAt: agora } : {}),
      failureScore,
      failureScoreOrigin,
      failureOverrideReason,
      failureOverrideAt,
      consequenceScore,
      ...(data.mtbfTargetHours !== undefined ? { mtbfTargetHours: data.mtbfTargetHours } : {}),
      ...(failureScoreOrigin === "MANUAL" ? { criticalityIndex, criticalityClass } : {}),
    },
  });

  // AUTO: refaz a conta de verdade (cobre tanto "acabou de voltar a automatico" quanto
  // qualquer revisao de S/P/MTBF-meta, que muda C ou Q mesmo com falha automatica).
  if (failureScoreOrigin === "AUTO") {
    return recalcularCriticidade(instrumentId, data.trigger ?? "MANUAL_REVIEW", { db, responsibleId: data.responsibleId, reason: data.reason });
  }

  const salvo = await db.assetCriticality.findUniqueOrThrow({ where: { instrumentId } });
  await db.assetCriticalityLog.create({
    data: {
      criticalityId: salvo.id,
      trigger: data.trigger ?? "MANUAL_REVIEW",
      origin: "MANUAL",
      safetyScore: salvo.safetyScore,
      productionScore: salvo.productionScore,
      failureScore: salvo.failureScore,
      criticalityIndex: salvo.criticalityIndex,
      criticalityClass: salvo.criticalityClass,
      reason: data.reason ?? null,
      responsibleId: data.responsibleId ?? null,
    },
  });
  return salvo;
}
