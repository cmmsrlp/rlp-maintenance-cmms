import type { InventoryMovementType } from "@prisma/client";
import { prisma } from "./prisma";
import { NotFoundError, ValidationError } from "../utils/errors";

interface SparePartMovementInput {
  sparePartId: string;
  type: InventoryMovementType;
  quantity: number;
  // Custo unitario deste movimento (opcional). Se omitido, herda o unitCost vigente da
  // peca - assim o historico de custo por ativo sempre tem uma base, mesmo sem informar
  // toda hora.
  unitCost?: number | null;
  reason?: string | null;
  maintenanceWorkOrderId?: string | null;
  createdById?: string;
}

/** Mesma logica do applyStockMovement, mas para o almoxarifado tecnico do CMMS (SparePart) -
 * estoque interno separado do catalogo comercial de Produtos. */
export async function applySparePartMovement(input: SparePartMovementInput) {
  const sparePart = await prisma.sparePart.findFirst({ where: { id: input.sparePartId, deletedAt: null } });
  if (!sparePart) throw new NotFoundError("Peca do almoxarifado");

  const delta = input.type === "OUT" ? -input.quantity : input.quantity;
  const newStock = input.type === "ADJUSTMENT" ? input.quantity : sparePart.stockQty + delta;
  if (newStock < 0) throw new ValidationError("Estoque nao pode ficar negativo.");

  const unitCost = input.unitCost ?? sparePart.unitCost ?? null;
  // Uma nova compra (IN) com custo informado atualiza o custo unitario vigente da peca -
  // metodo "ultimo custo", mais simples que media ponderada e suficiente nessa escala.
  const nextUnitCost = input.type === "IN" && input.unitCost != null ? input.unitCost : sparePart.unitCost;

  const [movement] = await prisma.$transaction([
    prisma.sparePartMovement.create({ data: { ...input, unitCost } }),
    prisma.sparePart.update({ where: { id: sparePart.id }, data: { stockQty: newStock, unitCost: nextUnitCost } }),
  ]);

  return movement;
}

// ---------------------------------------------------------------------------
// Reserva de material (planejamento reserva -> tecnico consome no apontamento).
// Nao mexe no estoque ate a reserva ser consumida - so marca como comprometido
// (SparePart.reservedQty), pra outra OS nao contar com a mesma peca.
// ---------------------------------------------------------------------------

interface ReserveSparePartInput {
  sparePartId: string;
  workOrderId: string;
  quantity: number;
  createdById?: string;
}

export async function reserveSparePart(input: ReserveSparePartInput) {
  const sparePart = await prisma.sparePart.findFirst({ where: { id: input.sparePartId, deletedAt: null } });
  if (!sparePart) throw new NotFoundError("Peca do almoxarifado");

  const available = sparePart.stockQty - sparePart.reservedQty;
  if (input.quantity > available) {
    throw new ValidationError(
      `Saldo disponivel insuficiente para reservar (${available} un. disponiveis - ${sparePart.stockQty} em estoque, ${sparePart.reservedQty} ja reservado).`,
    );
  }

  const [reservation] = await prisma.$transaction([
    prisma.sparePartReservation.create({ data: { ...input } }),
    prisma.sparePart.update({ where: { id: sparePart.id }, data: { reservedQty: { increment: input.quantity } } }),
  ]);
  return reservation;
}

export async function releaseSparePartReservation(reservationId: string) {
  const reservation = await prisma.sparePartReservation.findFirst({ where: { id: reservationId, status: "RESERVED" } });
  if (!reservation) throw new NotFoundError("Reserva");

  const [updated] = await prisma.$transaction([
    prisma.sparePartReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED", resolvedAt: new Date() } }),
    prisma.sparePart.update({ where: { id: reservation.sparePartId }, data: { reservedQty: { decrement: reservation.quantity } } }),
  ]);
  return updated;
}

/**
 * Consome a reserva: baixa do estoque o que foi REALMENTE usado e devolve o que sobrou.
 *
 * Antes o consumo era tudo-ou-nada: reservou 4 rolamentos, usou 2, saiam 4 do estoque. Os
 * outros 2 estavam fisicamente na prateleira e sumiam do saldo - o proximo a precisar
 * deles recebia "sem saldo" com a peca na mao. Agora a quantidade usada e' informada, sai
 * so ela, e o restante da reserva volta a ficar disponivel no mesmo ato.
 */
export async function consumeSparePartReservation(
  reservationId: string,
  opcoes: { quantity?: number; createdById?: string } = {},
) {
  // Tudo dentro de UMA transacao: antes eram duas separadas (o movimento de estoque numa,
  // o status da reserva + liberacao do reservedQty noutra) - uma falha entre as duas
  // deixava o estoque ja baixado mas a reserva ainda "Reservada" e o reservedQty intacto,
  // um estado inconsistente que so um ajuste manual no banco corrigia. E' o mesmo motivo
  // pelo qual um segundo clique tinha que ser bloqueado: sem isso, um duplo-clique (ou um
  // reenvio depois de um timeout) consumia a mesma reserva duas vezes.
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.sparePartReservation.findFirst({ where: { id: reservationId, status: "RESERVED" } });
    if (!reservation) throw new NotFoundError("Reserva (ja consumida, liberada, ou nao encontrada).");

    const consumida = opcoes.quantity ?? reservation.quantity;
    if (consumida <= 0) throw new ValidationError("Informe a quantidade utilizada.");
    if (consumida > reservation.quantity) {
      throw new ValidationError(
        `A quantidade utilizada (${consumida}) e' maior que a reservada (${reservation.quantity}). Reserve mais antes de consumir.`,
      );
    }
    const devolvida = reservation.quantity - consumida;

    const sparePart = await tx.sparePart.findFirst({ where: { id: reservation.sparePartId, deletedAt: null } });
    if (!sparePart) throw new NotFoundError("Peca do almoxarifado");

    const newStock = sparePart.stockQty - consumida;
    if (newStock < 0) throw new ValidationError("Estoque nao pode ficar negativo.");

    const movement = await tx.sparePartMovement.create({
      data: {
        sparePartId: reservation.sparePartId,
        type: "OUT",
        quantity: consumida,
        unitCost: sparePart.unitCost,
        maintenanceWorkOrderId: reservation.workOrderId,
        reason: devolvida > 0 ? `Consumo de reserva (${devolvida} devolvido ao estoque)` : "Consumo de reserva",
        createdById: opcoes.createdById,
      },
    });

    await tx.sparePart.update({ where: { id: sparePart.id }, data: { stockQty: newStock } });

    // Libera a reserva INTEIRA: a parte consumida ja saiu do estoque no movimento acima, e
    // a parte devolvida volta a ficar disponivel para outra OS.
    await tx.sparePartReservation.update({
      where: { id: reservation.id },
      data: { status: "CONSUMED", consumedQuantity: consumida, resolvedAt: new Date() },
    });
    await tx.sparePart.update({
      where: { id: reservation.sparePartId },
      data: { reservedQty: { decrement: reservation.quantity } },
    });

    return { movement, consumida, devolvida };
  });
}
