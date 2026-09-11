import type { Request, Response } from "express";
import { z } from "zod";
import { dataOpcional } from "../../utils/zod";
import { AssetHierarchyLevel, InstrumentStatus, MaintenancePriority, OperationalStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { asyncHandler } from "../../utils/asyncHandler";
import { parsePageParams, toSkipTake, buildPagedResult } from "../../utils/pagination";
import { ForbiddenError, NotFoundError, ValidationError } from "../../utils/errors";
import { writeAuditLog } from "../../utils/audit";
import { clientScopeFilter, assertServiceAccess, resolveClientScope } from "../../middleware/rbac";
import { deriveDueStatus, computeNextDueDate } from "../../utils/status";
import { getStorageProvider } from "../../lib/storage";
import { assertInstrumentLimitNotExceeded } from "../../lib/planLimits";
import type { AttachmentCategory } from "@prisma/client";

function withDerivedStatus<T extends { status: InstrumentStatus; nextDueDate: Date | null }>(instrument: T) {
  const derived = instrument.status === "IN_MAINTENANCE" ? "IN_MAINTENANCE" : deriveDueStatus(instrument.nextDueDate);
  return { ...instrument, derivedStatus: derived };
}

/** A arvore de ativos usa o nivel so pra escolher o icone de cada item. O nivel mora no
 * proprio ativo desde que "Tipo de ativo" saiu do cadastro; este apelido existe pra nao
 * quebrar as telas que ja liam "assetTypeLevel". */
function attachAssetTypeLevel<T extends { level: string | null }>(instruments: T[]): (T & { assetTypeLevel: string | null })[] {
  return instruments.map((i) => ({ ...i, assetTypeLevel: i.level }));
}

/** Troca a chave de armazenamento por um link temporario que a tela consegue exibir.
 * Assinar e' local (nao vai na rede), entao dá pra fazer isso item a item na listagem. */
async function attachPhotoUrl<T extends { photoKey: string | null; photoFileName: string | null }>(
  instruments: T[],
): Promise<(T & { photoUrl: string | null })[]> {
  const storage = getStorageProvider();
  return Promise.all(
    instruments.map(async (i) => ({
      ...i,
      photoUrl: i.photoKey ? await storage.getSignedDownloadUrl(i.photoKey, i.photoFileName ?? "foto", 3600) : null,
    })),
  );
}

/**
 * Coloca os ativos na ordem da arvore: cada pai seguido dos proprios filhos, e irmaos em
 * ordem de TAG.
 *
 * A listagem vinha ordenada por vencimento de calibracao - herdado de quando a tela era so
 * de instrumentos de medicao. Num parque de manutencao isso embaralha a estrutura: o
 * subconjunto aparecia antes da linha a que pertence, e o recuo de filho, sozinho, so
 * deixava a bagunca mais visivel.
 *
 * A ordem e' calculada aqui e nao no banco porque a arvore precisa sobreviver aos filtros
 * da tela: um ativo cujo pai foi filtrado fora entra como raiz, em vez de sumir da lista.
 */
function ordenarPelaArvore<T extends { id: string; parentId: string | null; tag: string | null }>(
  itens: T[],
): { ordenados: T[]; profundidadePorId: Map<string, number> } {
  const presentes = new Set(itens.map((i) => i.id));
  const filhosPorPai = new Map<string | null, T[]>();

  for (const item of itens) {
    // Pai fora do resultado (filtrado, ou de outro galho) = este ativo e' raiz aqui.
    const chave = item.parentId && presentes.has(item.parentId) ? item.parentId : null;
    const lista = filhosPorPai.get(chave) ?? [];
    lista.push(item);
    filhosPorPai.set(chave, lista);
  }

  for (const lista of filhosPorPai.values()) {
    lista.sort((a, b) => (a.tag ?? "").localeCompare(b.tag ?? "", "pt-BR", { numeric: true }));
  }

  const ordenados: T[] = [];
  const profundidadePorId = new Map<string, number>();
  const visitados = new Set<string>();
  const descer = (paiId: string | null, profundidade: number) => {
    // Ciclo ja e' barrado na escrita; o limite aqui e' so para nunca travar a listagem.
    if (profundidade > 20) return;
    for (const item of filhosPorPai.get(paiId) ?? []) {
      if (visitados.has(item.id)) continue;
      visitados.add(item.id);
      profundidadePorId.set(item.id, profundidade);
      ordenados.push(item);
      descer(item.id, profundidade + 1);
    }
  };
  descer(null, 0);

  // Rede de seguranca: nada pode desaparecer da lista por causa da ordenacao.
  for (const item of itens) {
    if (!visitados.has(item.id)) {
      profundidadePorId.set(item.id, 0);
      ordenados.push(item);
    }
  }
  return { ordenados, profundidadePorId };
}

export const listInstruments = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const pageParams = parsePageParams(req.query as Record<string, unknown>);
  const { clientId, search, status, parentId, criticality, plantId, areaId, systemId, costCenterId, operationalStatus, all, rootOnly } = req.query as {
    clientId?: string;
    search?: string;
    status?: InstrumentStatus;
    parentId?: string;
    criticality?: MaintenancePriority;
    plantId?: string;
    areaId?: string;
    systemId?: string;
    costCenterId?: string;
    operationalStatus?: OperationalStatus;
    // A arvore de ativos nao pode ser cortada no meio: um galho inteiro sumindo (o teto de
    // 100 da paginacao normal batia antes do primeiro cliente com parque grande acabar de
    // listar) fazia parecer que uma planta inteira nao tinha sido importada. "all" pede a
    // lista completa da consulta, sem o teto de paginacao - so quem monta arvore usa isto.
    all?: string;
    // So os ativos sem pai (raiz da arvore do cliente) - primeiro passo do carregamento
    // sob demanda: um parque de 10 mil ativos nao pode vir inteiro numa unica resposta so
    // porque a tela mostra 2 ou 3 plantas fechadas de cara.
    rootOnly?: string;
  };

  const where = {
    deletedAt: null,
    ...resolveClientScope(req, clientId),
    ...(status ? { status } : {}),
    ...(rootOnly === "true" ? { parentId: null } : parentId ? { parentId } : {}),
    ...(criticality ? { criticality } : {}),
    ...(plantId ? { plantId } : {}),
    ...(areaId ? { areaId } : {}),
    ...(systemId ? { systemId } : {}),
    ...(costCenterId ? { costCenterId } : {}),
    ...(operationalStatus ? { operationalStatus } : {}),
    ...(search
      ? {
          OR: [
            { tag: { contains: search, mode: "insensitive" as const } },
            { description: { contains: search, mode: "insensitive" as const } },
            { model: { contains: search, mode: "insensitive" as const } },
            { serialNumber: { contains: search, mode: "insensitive" as const } },
            { manufacturer: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // A pagina precisa sair da arvore inteira, nao de um pedaco dela: paginar antes de
  // ordenar deixaria o filho numa pagina e o pai noutra. Este primeiro passo traz so o
  // esqueleto (id/pai/TAG), que e' barato mesmo num parque grande.
  const esqueleto = await prisma.instrument.findMany({
    where,
    select: { id: true, parentId: true, tag: true },
  });
  const { ordenados: naOrdem, profundidadePorId } = ordenarPelaArvore(esqueleto);
  const wantsAll = all === "true";
  const { skip, take } = toSkipTake(pageParams);
  const idsDaPagina = (wantsAll ? naOrdem : naOrdem.slice(skip, skip + take)).map((i) => i.id);
  const posicao = new Map(idsDaPagina.map((id, i) => [id, i]));

  const [itemsFora, total] = await Promise.all([
    prisma.instrument.findMany({
      where: { id: { in: idsDaPagina } },
      include: {
        client: { select: { id: true, companyName: true, tradeName: true } },
        parent: { select: { id: true, type: true, model: true, serialNumber: true, tag: true, description: true } },
        plant: { select: { id: true, name: true } },
        area: { select: { id: true, name: true } },
        system: { select: { id: true, name: true } },
        costCenter: { select: { id: true, name: true, code: true } },
        // A arvore sob demanda decide se mostra o "+" de expandir sem precisar buscar os
        // filhos primeiro - so a contagem, nao a lista inteira.
        _count: { select: { children: { where: { deletedAt: null } } } },
      },
    }),
    Promise.resolve(esqueleto.length),
  ]);

  // O `in` volta em ordem do banco; a ordem da arvore e' reposta aqui.
  const items = itemsFora.sort((a, b) => (posicao.get(a.id) ?? 0) - (posicao.get(b.id) ?? 0));

  const withLevel = await attachPhotoUrl(attachAssetTypeLevel(items.map(withDerivedStatus)));
  // A tela recua cada linha pela profundidade real, e nao mais so "tem pai ou nao tem":
  // com tres niveis, filho e neto ficavam no mesmo recuo.
  const comProfundidade = withLevel.map(({ _count, ...i }) => ({
    ...i,
    treeDepth: profundidadePorId.get(i.id) ?? 0,
    childrenCount: _count.children,
  }));
  res.json(
    wantsAll
      ? { items: comProfundidade, page: 1, pageSize: comProfundidade.length, total, totalPages: 1 }
      : buildPagedResult(comProfundidade, total, pageParams),
  );
});

const instrumentRefSelect = { id: true, type: true, model: true, serialNumber: true, tag: true, description: true } as const;

export const getInstrument = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    include: {
      client: { select: { id: true, companyName: true, tradeName: true } },
      parent: { select: instrumentRefSelect },
      children: { where: { deletedAt: null }, select: instrumentRefSelect, orderBy: { tag: "asc" } },
      plant: { select: { id: true, name: true } },
      area: { select: { id: true, name: true } },
      system: { select: { id: true, name: true } },
      costCenter: { select: { id: true, name: true, code: true } },
    },
  });
  if (!instrument) throw new NotFoundError("Instrumento");
  const [withLevel] = await attachPhotoUrl(attachAssetTypeLevel([withDerivedStatus(instrument)]));

  // Marcar o ativo como calibravel ou lubrificavel e' so metade do trabalho: sem plano de
  // calibracao ele nunca e' chamado para calibrar, e sem ponto cadastrado ele nunca entra
  // numa rota de lubrificacao. A ficha diz o que ainda falta, em vez de deixar a marca
  // parecer que resolveu.
  const [planosDeCalibracao, pontosDeLubrificacao] = await Promise.all([
    instrument.calibratable
      ? prisma.maintenancePlan.count({
          where: { instrumentId: instrument.id, deletedAt: null, planType: "CALIBRATION", status: "ACTIVE" },
        })
      : Promise.resolve(0),
    instrument.lubricatable
      ? prisma.lubricationPoint.count({ where: { instrumentId: instrument.id, deletedAt: null, active: true } })
      : Promise.resolve(0),
  ]);

  res.json({
    ...withLevel,
    pendencias: {
      planoDeCalibracao: instrument.calibratable && planosDeCalibracao === 0,
      pontoDeLubrificacao: instrument.lubricatable && pontosDeLubrificacao === 0,
    },
    calibrationPlanCount: planosDeCalibracao,
    lubricationPointCount: pontosDeLubrificacao,
  });
});

const instrumentSchema = z.object({
  // Opcional aqui porque o portal do cliente nunca envia clientId (o backend forca a
  // propria empresa do usuario); obrigatorio apenas para a equipe interna, checado abaixo.
  clientId: z.string().uuid().optional(),
  // "Tipo de ativo" saiu do cadastro: era um campo de texto que duplicava o nivel da
  // arvore. Continua aceito na API pra nao quebrar integracao antiga, mas quem manda e' o
  // nivel - e o "type" gravado passa a ser o rotulo dele.
  type: z.string().min(2).optional(),
  // Onde o ativo fica na arvore: Planta > Area > Maquina > Subconjunto > Parte.
  // Opcional porque o cadastro rapido nao pergunta - fica sem nivel, e nenhuma regra
  // dispara em cima de um ativo incompleto.
  level: z.nativeEnum(AssetHierarchyLevel).nullish(),
  // TAG e o codigo que identifica o ativo (cadastrado pelo cliente ou pela OptiProcess) -
  // e' o que agrupa, na ficha do ativo, todas as calibracoes e ordens de servico dele.
  tag: z.string().min(1, "Informe o TAG do ativo."),
  // Nome do ativo em linguagem de gente - junto do TAG e' o que identifica nas telas.
  description: z.string().nullish(),
  // Marca o ativo como sujeito a calibracao (entra na lista da OptiProcess).
  calibratable: z.boolean().optional(),
  // Marca o ativo como ponto de lubrificacao - irmao do calibratable.
  lubricatable: z.boolean().optional(),
  // Ficha do fabricante e' opcional: nem todo ativo de manutencao tem numero de serie.
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  measurementRange: z.string().nullish(),
  resolution: z.string().nullish(),
  unit: z.string().nullish(),
  installationLocation: z.string().nullish(),
  calibrationFrequencyMonths: z.coerce.number().int().min(1).nullish(),
  lastCalibrationDate: dataOpcional,
  status: z.nativeEnum(InstrumentStatus).optional(),
  // Quanto uma parada deste ativo pesa pra empresa - guia prioridade de OS e estoque.
  criticality: z.nativeEnum(MaintenancePriority).optional(),
  // Condicao operacional agora (roda/parado/reserva/desativado) - independente do status
  // de calibracao acima.
  operationalStatus: z.nativeEnum(OperationalStatus).optional(),
  // Arvore de ativos: um filho aponta para o ativo pai (mesmo cliente).
  parentId: z.string().uuid().nullish(),
  // Planta/Area/Sistema/Centro de custo: localizacao/classificacao do ativo (mesmo cliente).
  plantId: z.string().uuid().nullish(),
  areaId: z.string().uuid().nullish(),
  // systemId saiu do cadastro: era um nivel da propria arvore repetido num campo solto,
  // e duas versoes da mesma informacao acabam divergindo. A arvore e' a verdade tecnica.
  // A coluna continua no banco para nao perder o que ja foi preenchido.
  costCenterId: z.string().uuid().nullish(),
  // Ficha tecnica que depende do tipo (Motor, Redutor, Extrusora, Rolo...) - o backend nao
  // conhece os campos de cada tipo, so guarda o que o frontend montou.
  specificAttributes: z.record(z.string(), z.string()).nullish(),
});

/** Planta/area/centro de custo escolhidos precisam existir e ser do mesmo cliente do ativo -
 * senao a ficha mostraria localizacao de outra empresa. */
async function assertLocationFieldsBelongToClient(clientId: string, data: Pick<z.infer<typeof instrumentSchema>, "plantId" | "areaId" | "costCenterId">): Promise<void> {
  if (data.plantId) {
    const plant = await prisma.plant.findFirst({ where: { id: data.plantId, deletedAt: null } });
    if (!plant) throw new NotFoundError("Planta");
    if (plant.clientId !== clientId) throw new ValidationError("A planta selecionada e' de outra empresa.");
  }
  if (data.areaId) {
    const area = await prisma.area.findFirst({ where: { id: data.areaId, deletedAt: null } });
    if (!area) throw new NotFoundError("Area");
    if (area.clientId !== clientId) throw new ValidationError("A area selecionada e' de outra empresa.");
  }
  if (data.costCenterId) {
    const costCenter = await prisma.costCenter.findFirst({ where: { id: data.costCenterId, deletedAt: null } });
    if (!costCenter) throw new NotFoundError("Centro de custo");
    if (costCenter.clientId !== clientId) throw new ValidationError("O centro de custo selecionado e' de outra empresa.");
  }
}


// ---------------------------------------------------------------------------
// Heranca de contexto na arvore de ativos
//
// A arvore (Planta > Area > Ativo/Sistema > Equipamento > Componente) e' a estrutura
// TECNICA: diz o que faz parte do que. Planta / Area / Centro de custo sao CONTEXTO de
// localizacao e rateio: definidos uma vez no topo e herdados por todos os descendentes,
// para nao repetir (nem divergir) a mesma informacao em cada nivel.
// ---------------------------------------------------------------------------

/** Rotulo de cada nivel - e' o que fica gravado em "type", que continua sendo o texto
 * curto que as telas e o log de auditoria mostram ao lado do TAG. */
const ROTULO_DO_NIVEL: Record<AssetHierarchyLevel, string> = {
  PLANT: "Planta",
  AREA: "Area",
  MACHINE: "Maquina",
  SUBASSEMBLY: "Subconjunto",
  PART: "Parte",
};

/** Tipo de um ativo cadastrado pelo caminho rapido, que ainda nao foi classificado. */
export const TIPO_A_DEFINIR = "A definir";

/** Contexto (planta/area/centro de custo) que este ativo deve ter, dado o pai escolhido.
 * O centro de custo vem do padrao da area; um ativo marcado como excecao (so ADMIN) fica
 * com o que foi definido a mao. */
async function resolveInheritedContext(
  parentId: string | null | undefined,
  fallback: { plantId?: string | null; areaId?: string | null },
  /** Este ativo define a propria area? Sem isso, o filho ficaria preso a area antiga
   * quando o pai mudasse de area - o valor dele venceria a heranca por acidente. */
  areaPropria = false,
) {
  let plantId = fallback.plantId ?? null;
  let areaId = fallback.areaId ?? null;

  if (parentId) {
    const parent = await prisma.instrument.findFirst({
      where: { id: parentId, deletedAt: null },
      select: { plantId: true, areaId: true },
    });
    // A planta e' sempre a do pai: um componente nao muda de fabrica.
    plantId = parent?.plantId ?? null;
    // A AREA, nao. A raiz costuma ser a planta inteira, que tem varias linhas - forcar a
    // area so no topo obrigava a fabrica inteira a ficar numa area so, e o resultado era
    // uma arvore inteira sem area nenhuma (foi o que aconteceu na Votorantim). O ativo que
    // representa a linha define a sua area; dali para baixo, herda de novo.
    areaId = (areaPropria ? fallback.areaId : null) ?? parent?.areaId ?? null;
  }

  let costCenterId: string | null = null;
  if (areaId) {
    const area = await prisma.area.findFirst({ where: { id: areaId, deletedAt: null }, select: { costCenterId: true } });
    costCenterId = area?.costCenterId ?? null;
  }

  return { plantId, areaId, costCenterId };
}

/** Depois que o contexto de um ativo muda, todo o galho abaixo dele precisa acompanhar -
 * senao o filho continuaria apontando para a area antiga. Ativos marcados como excecao
 * mantem o proprio centro de custo. */
async function propagateContextToDescendants(instrumentId: string, depth = 0): Promise<void> {
  if (depth > 20) return; // arvore muito profunda: para por seguranca (ciclo ja e' barrado na escrita)

  const parent = await prisma.instrument.findFirst({
    where: { id: instrumentId, deletedAt: null },
    select: { plantId: true, areaId: true },
  });
  if (!parent) return;

  const children = await prisma.instrument.findMany({
    where: { parentId: instrumentId, deletedAt: null },
    select: { id: true, costCenterOverride: true, areaOverride: true, areaId: true },
  });
  if (children.length === 0) return;

  const centroDaArea = async (areaId: string | null) => {
    if (!areaId) return null;
    const area = await prisma.area.findFirst({ where: { id: areaId, deletedAt: null }, select: { costCenterId: true } });
    return area?.costCenterId ?? null;
  };
  const centroDoPai = await centroDaArea(parent.areaId);

  for (const child of children) {
    // Filho que definiu a propria area (a linha, tipicamente) mantem a dela - e leva o
    // centro de custo dela junto. Sem isso, salvar qualquer coisa na raiz apagaria a area
    // escolhida no meio da arvore.
    const areaDoFilho = child.areaOverride ? child.areaId : parent.areaId;
    const centro = child.areaOverride ? await centroDaArea(child.areaId) : centroDoPai;

    await prisma.instrument.update({
      where: { id: child.id },
      data: {
        plantId: parent.plantId,
        areaId: areaDoFilho,
        ...(child.costCenterOverride ? {} : { costCenterId: centro }),
      },
    });
    await propagateContextToDescendants(child.id, depth + 1);
  }
}

/**
 * Regras que dependem do nivel do ativo na arvore.
 *
 * Fabricante, modelo e numero de serie NAO entram aqui: uma linha de producao, um tanque
 * ou um sistema hidraulico nao tem numero de serie, e exigir isso so fazia digitar "-"
 * para escapar do campo.
 */
function assertLevelRules(
  data: { level?: AssetHierarchyLevel | null; description?: string | null; parentId?: string | null },
  { isCreate }: { isCreate: boolean },
): void {
  if (isCreate && !data.description?.trim()) {
    throw new ValidationError("Informe a descricao do ativo.");
  }

  // Ativo raiz e' a planta; qualquer outro nivel precisa dizer de quem faz parte.
  // Sem nivel escolhido nao ha regra a cobrar - o cadastro rapido continua passando.
  if (isCreate && data.level && data.level !== "PLANT" && !data.parentId) {
    throw new ValidationError("Informe o ativo pai - so a planta fica na raiz da arvore.");
  }
}

/** Ativo pai precisa existir, pertencer ao mesmo cliente e nao criar um ciclo na arvore. */
async function assertValidParent(clientId: string, parentId: string, excludeId?: string): Promise<void> {
  if (parentId === excludeId) throw new ValidationError("Um ativo nao pode ser pai de si mesmo.");

  const parent = await prisma.instrument.findFirst({ where: { id: parentId, deletedAt: null } });
  if (!parent) throw new NotFoundError("Ativo pai");
  if (parent.clientId !== clientId) throw new ValidationError("O ativo pai precisa ser do mesmo cliente.");

  if (excludeId) {
    // Sobe a arvore a partir do pai escolhido: se chegar no proprio ativo, seria um ciclo.
    let cursor: string | null = parent.parentId;
    for (let i = 0; i < 50 && cursor; i++) {
      if (cursor === excludeId) throw new ValidationError("Essa escolha criaria um ciclo na arvore de ativos.");
      const next: { parentId: string | null } | null = await prisma.instrument.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = next?.parentId ?? null;
    }
  }
}

/** O Prisma nao aceita `null` cru num campo Json - precisa do marcador Prisma.JsonNull para
 * gravar "sem valor" em vez de deixar a coluna intocada (que e' o que `undefined` faria). */
function paraJson(valor: Record<string, string> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (valor === undefined) return undefined;
  return valor === null ? Prisma.JsonNull : valor;
}

/** TAG e o identificador do ativo dentro da empresa cliente - nao pode repetir na mesma
 * empresa, senao duas listas de calibracoes/OS ficariam misturadas sob o mesmo codigo. */
async function assertTagAvailable(clientId: string, tag: string, excludeId?: string): Promise<void> {
  const conflict = await prisma.instrument.findFirst({
    where: {
      clientId,
      deletedAt: null,
      tag: { equals: tag, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (conflict) throw new ValidationError(`Ja existe um ativo com o TAG "${tag}" cadastrado para este cliente.`);
}

export const createInstrument = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = instrumentSchema.parse(req.body);
  // Cliente so cadastra ativo para a propria empresa - o clientId vem sempre da sessao,
  // nunca do corpo da requisicao (mesmo que o cliente tente enviar outro).
  if (req.user?.role === "CLIENT") {
    if (!req.user.clientId) throw new ForbiddenError();
    data.clientId = req.user.clientId;
  } else if (!data.clientId) {
    throw new ValidationError("Selecione o cliente.");
  }
  const clientId = data.clientId;
  await assertInstrumentLimitNotExceeded(clientId);
  await assertTagAvailable(clientId, data.tag);
  if (data.parentId) await assertValidParent(clientId, data.parentId);
  await assertLocationFieldsBelongToClient(clientId, data);
  assertLevelRules(data, { isCreate: true });
  const nextDueDate = data.lastCalibrationDate && data.calibrationFrequencyMonths
    ? computeNextDueDate(data.lastCalibrationDate, data.calibrationFrequencyMonths)
    : null;

  // Planta/area/centro de custo nao sao digitados no filho: vem do pai (e o centro de
  // custo, do padrao da area). Excecao de centro de custo so o ADMIN faz.
  // Um ativo do meio da arvore pode dizer em que area ele fica (a linha, tipicamente); dali
  // para baixo o galho herda dele. A marca existe para a propagacao vinda da raiz nao
  // apagar essa escolha depois.
  const areaOverride = !!data.parentId && !!data.areaId;
  const context = await resolveInheritedContext(data.parentId, data, areaOverride);
  // No cadastro o centro de custo vem SEMPRE da area (propria, ou herdada do pai). Abrir
  // excecao e' um ato deliberado sobre um ativo que ja existe, feito na edicao: antes,
  // qualquer costCenterId que viesse no corpo virava excecao em silencio - inclusive num
  // ativo filho, cujo formulario nem mostra esse campo.
  const costCenterOverride = false;

  // Calibravel e' o que a OptiProcess presta servico sobre - e' o que separa a lista dela
  // da arvore do CMMS do cliente. Por isso a marca e' explicita: ou o usuario marcou, ou
  // informou periodicidade de calibracao (o que so faz sentido em item calibravel).
  //
  // Antes bastava ser da equipe interna para o ativo nascer calibravel. Como o ADMIN agora
  // tambem cadastra o parque do cliente pelo acesso master, e o cadastro rapido nem
  // pergunta isso, cada maquina cadastrada por ele entrava na lista de calibracao - que e'
  // justamente o que nao se queria ver ali.
  const calibratable = data.calibratable ?? data.calibrationFrequencyMonths != null;

  const instrument = await prisma.instrument.create({
    data: {
      ...data,
      // O texto do tipo acompanha o nivel escolhido. Cadastro rapido nao escolhe nivel:
      // fica "A definir", honesto na tela, e nenhuma regra de nivel dispara em cima de um
      // ativo incompleto.
      type: data.type ?? (data.level ? ROTULO_DO_NIVEL[data.level] : TIPO_A_DEFINIR),
      calibratable,
      clientId,
      plantId: context.plantId,
      areaId: context.areaId,
      costCenterId: context.costCenterId,
      costCenterOverride,
      areaOverride,
      nextDueDate,
      specificAttributes: paraJson(data.specificAttributes),
      createdById: req.user?.sub,
    },
  });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "CREATE",
    entityType: "Instrument",
    entityId: instrument.id,
    description: `Ativo ${instrument.tag ?? instrument.type}${instrument.description ? ` - ${instrument.description}` : ""} cadastrado`,
  });

  res.status(201).json(instrument);
});

export const updateInstrument = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = instrumentSchema.partial().parse(req.body);
  const existing = await prisma.instrument.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!existing) throw new NotFoundError("Instrumento");

  if (req.user?.role === "CLIENT") {
    if (existing.clientId !== req.user.clientId) throw new ForbiddenError();
    delete data.clientId; // cliente nunca transfere o ativo para outra empresa
  }

  if (data.tag) {
    await assertTagAvailable(data.clientId ?? existing.clientId, data.tag, existing.id);
  }
  if (data.parentId) {
    await assertValidParent(data.clientId ?? existing.clientId, data.parentId, existing.id);
  }
  await assertLocationFieldsBelongToClient(data.clientId ?? existing.clientId, data);

  const lastCalibrationDate = data.lastCalibrationDate ?? existing.lastCalibrationDate;
  const frequency = data.calibrationFrequencyMonths ?? existing.calibrationFrequencyMonths;
  const nextDueDate =
    lastCalibrationDate && frequency ? computeNextDueDate(lastCalibrationDate, frequency) : existing.nextDueDate;

  // Mesma heranca do cadastro. Se o contexto mudou (trocou de pai, ou a area mudou de
  // centro de custo), o galho inteiro abaixo precisa acompanhar - senao o filho ficaria
  // apontando para a area antiga.
  // Informar a area num ativo que tem pai e' dizer "esta linha fica nesta area" - a marca
  // sobrevive as propagacoes seguintes. Limpar a area volta a herdar do pai.
  const temPai = (data.parentId !== undefined ? data.parentId : existing.parentId) != null;
  const areaOverride =
    data.areaId !== undefined ? temPai && data.areaId != null : existing.areaOverride && temPai;

  const context = await resolveInheritedContext(
    data.parentId !== undefined ? data.parentId : existing.parentId,
    { plantId: data.plantId ?? existing.plantId, areaId: data.areaId ?? existing.areaId },
    areaOverride,
  );
  const isAdmin = req.user?.role === "ADMIN";
  const querSetarCentroCusto = data.costCenterId !== undefined && data.costCenterId !== null;
  const costCenterOverride =
    isAdmin && querSetarCentroCusto ? data.costCenterId !== context.costCenterId : existing.costCenterOverride;
  const costCenterId = costCenterOverride
    ? isAdmin && querSetarCentroCusto
      ? data.costCenterId
      : existing.costCenterId
    : context.costCenterId;

  const instrument = await prisma.instrument.update({
    where: { id: req.params.id },
    data: {
      ...data,
      // Trocar o nivel troca junto o texto do tipo, senao a ficha mostraria "Maquina"
      // num ativo que virou "Subconjunto".
      ...(data.level && !data.type ? { type: ROTULO_DO_NIVEL[data.level] } : {}),
      plantId: context.plantId,
      areaId: context.areaId,
      costCenterId,
      costCenterOverride,
      areaOverride,
      nextDueDate,
      specificAttributes: paraJson(data.specificAttributes),
    },
  });

  await propagateContextToDescendants(instrument.id);

  await writeAuditLog({
    userId: req.user?.sub,
    action: "UPDATE",
    entityType: "Instrument",
    entityId: instrument.id,
    description: `Ativo ${instrument.tag ?? instrument.type}${instrument.description ? ` - ${instrument.description}` : ""} atualizado`,
  });

  res.json(instrument);
});

/**
 * O que some junto ao remover o ativo - usado na confirmacao da tela.
 *
 * Remover e' exclusao logica: nada e' apagado do banco, e o historico continua ligado ao
 * ativo. Mas ele sai das listas, das rotas e da programacao, e por isso a tela precisa
 * dizer o tamanho do que esta pendurado nele antes de perguntar "tem certeza?".
 */
async function impactoDaRemocao(instrumentId: string) {
  const [filhos, ordensAbertas, ordens, planos, pontos] = await Promise.all([
    prisma.instrument.count({ where: { parentId: instrumentId, deletedAt: null } }),
    prisma.maintenanceWorkOrder.count({
      where: { instrumentId, deletedAt: null, status: { notIn: ["COMPLETED", "CANCELED"] } },
    }),
    prisma.maintenanceWorkOrder.count({ where: { instrumentId, deletedAt: null } }),
    prisma.maintenancePlan.count({ where: { instrumentId, deletedAt: null } }),
    prisma.lubricationPoint.count({ where: { instrumentId, deletedAt: null, active: true } }),
  ]);
  return { filhos, ordensAbertas, ordens, planos, pontos };
}

export const getInstrumentRemovalImpact = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!existing) throw new NotFoundError("Ativo");
  res.json(await impactoDaRemocao(existing.id));
});

export const deleteInstrument = asyncHandler(async (req: Request, res: Response) => {
  // O escopo do cliente faltava aqui: sem ele, bastava o id para remover ativo de outra
  // empresa. Nas outras rotas o filtro ja existia; nesta, nao.
  const existing = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!existing) throw new NotFoundError("Instrumento");

  const impacto = await impactoDaRemocao(existing.id);

  // Remover o pai deixaria o galho inteiro pendurado num ativo que sumiu das telas: os
  // filhos continuariam existindo, sem aparecer na arvore e sem como serem alcancados.
  if (impacto.filhos > 0) {
    throw new ValidationError(
      `Este ativo tem ${impacto.filhos} ativo(s) abaixo dele na arvore. Remova ou mova esses componentes antes - senao eles ficariam sem lugar na estrutura.`,
    );
  }

  // Ordem em aberto e' trabalho que alguem ainda vai executar. Some da programacao sem
  // aviso se o ativo for embora agora.
  if (impacto.ordensAbertas > 0) {
    throw new ValidationError(
      `Este ativo tem ${impacto.ordensAbertas} ordem(ns) de manutencao em aberto. Conclua ou cancele antes de remover o ativo.`,
    );
  }

  await prisma.instrument.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });

  await writeAuditLog({
    userId: req.user?.sub,
    action: "DELETE",
    entityType: "Instrument",
    entityId: existing.id,
    description: `Ativo ${existing.tag ?? existing.type}${existing.description ? ` - ${existing.description}` : ""} removido`,
  });

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// BOM (lista de materiais): quais pecas do almoxarifado sao usadas neste ativo.
// ---------------------------------------------------------------------------

export const listAssetParts = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Instrumento");

  const parts = await prisma.assetPart.findMany({
    where: { instrumentId: instrument.id },
    include: { sparePart: true },
    orderBy: { createdAt: "asc" },
  });
  res.json(parts);
});

const assetPartSchema = z.object({
  sparePartId: z.string().uuid(),
  notes: z.string().nullish(),
});

export const addAssetPart = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const data = assetPartSchema.parse(req.body);
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!instrument) throw new NotFoundError("Instrumento");

  const sparePart = await prisma.sparePart.findFirst({ where: { id: data.sparePartId, deletedAt: null } });
  if (!sparePart) throw new NotFoundError("Peca do almoxarifado");
  if (sparePart.clientId !== instrument.clientId) {
    throw new ValidationError("Essa peca e' do almoxarifado de outra empresa.");
  }

  const existing = await prisma.assetPart.findFirst({
    where: { instrumentId: instrument.id, sparePartId: data.sparePartId },
  });
  if (existing) throw new ValidationError("Esta peca ja esta vinculada a este ativo.");

  const link = await prisma.assetPart.create({
    data: { instrumentId: instrument.id, sparePartId: data.sparePartId, notes: data.notes },
    include: { sparePart: true },
  });
  res.status(201).json(link);
});

export const removeAssetPart = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
  });
  if (!instrument) throw new NotFoundError("Instrumento");

  const link = await prisma.assetPart.findFirst({
    where: { id: req.params.linkId, instrumentId: instrument.id },
  });
  if (!link) throw new NotFoundError("Vinculo de peca");

  await prisma.assetPart.delete({ where: { id: link.id } });
  res.status(204).send();
});

/**
 * Historico real de consumo de pecas deste ativo - diferente do BOM (que so lista o que
 * e' COMPATIVEL), isso soma o que de fato ja foi baixado do almoxarifado nas OS deste
 * ativo, pra responder "quais spare parts esse ativo realmente usa e com que frequencia".
 */
export const getInstrumentPartsHistory = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Instrumento");

  const movements = await prisma.sparePartMovement.findMany({
    where: { type: "OUT", maintenanceWorkOrder: { instrumentId: instrument.id, deletedAt: null } },
    include: { sparePart: { select: { id: true, name: true, code: true, unit: true } }, maintenanceWorkOrder: { select: { id: true, number: true } } },
    orderBy: { createdAt: "desc" },
  });

  const byPart = new Map<
    string,
    {
      sparePart: (typeof movements)[number]["sparePart"];
      totalQuantity: number;
      timesUsed: number;
      // Custo so soma quando o movimento tem unitCost - sem isso, fica null (opcional).
      totalCost: number | null;
      lastUsedAt: Date;
      lastWorkOrder: { id: string; number: string } | null;
    }
  >();
  for (const m of movements) {
    const movementCost = m.unitCost != null ? m.unitCost * m.quantity : null;
    const entry = byPart.get(m.sparePartId);
    if (entry) {
      entry.totalQuantity += m.quantity;
      entry.timesUsed += 1;
      if (movementCost != null) entry.totalCost = (entry.totalCost ?? 0) + movementCost;
    } else {
      byPart.set(m.sparePartId, {
        sparePart: m.sparePart,
        totalQuantity: m.quantity,
        timesUsed: 1,
        totalCost: movementCost,
        lastUsedAt: m.createdAt,
        lastWorkOrder: m.maintenanceWorkOrder ? { id: m.maintenanceWorkOrder.id, number: m.maintenanceWorkOrder.number } : null,
      });
    }
  }

  res.json([...byPart.values()].sort((a, b) => b.totalQuantity - a.totalQuantity));
});

/**
 * Gastos totais do ativo (pecas + mao de obra), somando todas as OS - o que fecha o
 * ciclo "adicionar na OS -> ver o gasto por ativo" pedido pelo cliente.
 */
export const getInstrumentCostSummary = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Instrumento");

  const [partsMovements, laborEntries, thirdPartyServices] = await Promise.all([
    prisma.sparePartMovement.findMany({
      where: { type: "OUT", maintenanceWorkOrder: { instrumentId: instrument.id, deletedAt: null } },
      select: { quantity: true, unitCost: true },
    }),
    prisma.workOrderLabor.findMany({
      where: { workOrder: { instrumentId: instrument.id, deletedAt: null } },
      select: { hours: true, hourlyRateSnapshot: true },
    }),
    prisma.workOrderThirdPartyService.findMany({
      where: { workOrder: { instrumentId: instrument.id, deletedAt: null } },
      select: { cost: true },
    }),
  ]);

  let partsCost = 0;
  let partsCostKnown = false;
  for (const m of partsMovements) {
    if (m.unitCost != null) {
      partsCost += m.unitCost * m.quantity;
      partsCostKnown = true;
    }
  }

  let laborCost = 0;
  let laborCostKnown = false;
  let totalHours = 0;
  for (const l of laborEntries) {
    totalHours += l.hours;
    if (l.hourlyRateSnapshot != null) {
      laborCost += l.hourlyRateSnapshot * l.hours;
      laborCostKnown = true;
    }
  }

  const thirdPartyCost = thirdPartyServices.reduce((sum, s) => sum + s.cost, 0);
  const thirdPartyCostKnown = thirdPartyServices.length > 0;

  res.json({
    partsCost: partsCostKnown ? partsCost : null,
    laborCost: laborCostKnown ? laborCost : null,
    thirdPartyCost: thirdPartyCostKnown ? thirdPartyCost : null,
    totalCost:
      partsCostKnown || laborCostKnown || thirdPartyCostKnown
        ? partsCost + laborCost + thirdPartyCost
        : null,
    totalLaborHours: totalHours,
  });
});

// ---------------------------------------------------------------------------
// Anexos do ativo: manual, foto do equipamento, etc.
// ---------------------------------------------------------------------------

async function listInstrumentAttachments(instrumentId: string) {
  return prisma.attachment.findMany({
    where: { entityType: "INSTRUMENT", entityId: instrumentId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export const listInstrumentAttachmentsRoute = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Ativo");
  res.json(await listInstrumentAttachments(instrument.id));
});

/** Foto principal do ativo. Substituir apaga a anterior do armazenamento - nao faz sentido
 * acumular fotos orfas de um campo que so guarda uma. */
export const uploadInstrumentPhoto = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.instrument.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Ativo");

  const file = req.file;
  if (!file) throw new ValidationError("Selecione uma imagem.");
  if (!file.mimetype.startsWith("image/")) throw new ValidationError("A foto do ativo precisa ser uma imagem.");

  const storage = getStorageProvider();
  const key = `instruments/${existing.id}/foto-${Date.now()}-${file.originalname}`;
  await storage.upload(key, file.buffer, file.mimetype);

  const anterior = existing.photoKey;
  const instrument = await prisma.instrument.update({
    where: { id: existing.id },
    data: { photoKey: key, photoFileName: file.originalname },
  });
  if (anterior) await storage.delete(anterior).catch(() => undefined);

  const [comFoto] = await attachPhotoUrl([instrument]);
  res.status(201).json(comFoto);
});

export const deleteInstrumentPhoto = asyncHandler(async (req: Request, res: Response) => {
  await assertServiceAccess(req, ["CMMS_MAINTENANCE"]);
  const existing = await prisma.instrument.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Ativo");

  if (existing.photoKey) await getStorageProvider().delete(existing.photoKey).catch(() => undefined);
  await prisma.instrument.update({ where: { id: existing.id }, data: { photoKey: null, photoFileName: null } });
  res.status(204).send();
});

export const uploadInstrumentAttachment = asyncHandler(async (req: Request, res: Response) => {
  const existing = await prisma.instrument.findFirst({ where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) } });
  if (!existing) throw new NotFoundError("Ativo");

  const file = req.file;
  if (!file) throw new ValidationError("Selecione um arquivo.");

  const { category, caption } = req.body as { category?: AttachmentCategory; caption?: string };

  const key = `instruments/${existing.id}/${Date.now()}-${file.originalname}`;
  await getStorageProvider().upload(key, file.buffer, file.mimetype);

  const attachment = await prisma.attachment.create({
    data: {
      entityType: "INSTRUMENT",
      entityId: existing.id,
      category: category && ["LOCATION", "INSTRUMENT", "STANDARD", "MEASUREMENT", "DOCUMENT", "OTHER"].includes(category) ? category : "OTHER",
      caption: caption || null,
      fileKey: key,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedById: req.user?.sub,
    },
  });

  res.status(201).json(attachment);
});

export const deleteInstrumentAttachment = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Ativo");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "INSTRUMENT", entityId: instrument.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  await getStorageProvider().delete(attachment.fileKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });

  res.status(204).send();
});

export const getInstrumentAttachmentUrl = asyncHandler(async (req: Request, res: Response) => {
  const instrument = await prisma.instrument.findFirst({
    where: { id: req.params.id, deletedAt: null, ...clientScopeFilter(req) },
    select: { id: true },
  });
  if (!instrument) throw new NotFoundError("Ativo");

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, entityType: "INSTRUMENT", entityId: instrument.id },
  });
  if (!attachment) throw new NotFoundError("Anexo");

  const url = await getStorageProvider().getSignedDownloadUrl(attachment.fileKey, attachment.fileName);
  res.json({ url });
});
