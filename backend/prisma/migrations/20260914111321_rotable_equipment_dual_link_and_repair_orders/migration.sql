/*
  Warnings:

  - You are about to drop the `rotable_reconditionings` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "RepairBudgetStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RotableRepairOutcome" AS ENUM ('REPAIRED', 'PARTIALLY_REPAIRED', 'SCRAPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentEntityType" ADD VALUE 'ROTABLE_EQUIPMENT';
ALTER TYPE "AttachmentEntityType" ADD VALUE 'ROTABLE_REPAIR_ORDER';

-- AlterEnum
ALTER TYPE "RotableEquipmentStatus" ADD VALUE 'QUARANTINE';

-- DropForeignKey
ALTER TABLE "rotable_reconditionings" DROP CONSTRAINT "rotable_reconditionings_rotableId_fkey";

-- AlterTable
ALTER TABLE "maintenance_work_orders" ADD COLUMN     "rotableEquipmentId" TEXT;

-- AlterTable
ALTER TABLE "rotable_installations" ADD COLUMN     "conditionAtRemoval" TEXT,
ADD COLUMN     "meterReadingAtInstall" DOUBLE PRECISION,
ADD COLUMN     "meterReadingAtRemoval" DOUBLE PRECISION;

-- DropTable
DROP TABLE "rotable_reconditionings";

-- CreateTable
CREATE TABLE "rotable_repair_orders" (
    "id" TEXT NOT NULL,
    "rotableId" TEXT NOT NULL,
    "workOrderId" TEXT,
    "defectReported" TEXT,
    "diagnosis" TEXT,
    "failureCodeId" TEXT,
    "vendor" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "budgetNumber" TEXT,
    "budgetValue" DOUBLE PRECISION,
    "budgetStatus" "RepairBudgetStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "promisedReturnAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "serviceDone" TEXT,
    "partsReplacedNotes" TEXT,
    "laborNotes" TEXT,
    "testsPerformed" TEXT,
    "finalReport" TEXT,
    "warrantyMonths" INTEGER,
    "warrantyNotes" TEXT,
    "finalCost" DOUBLE PRECISION,
    "conditionAfterRepair" TEXT,
    "outcome" "RotableRepairOutcome",
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rotable_repair_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rotable_repair_orders_rotableId_idx" ON "rotable_repair_orders"("rotableId");

-- CreateIndex
CREATE INDEX "rotable_repair_orders_workOrderId_idx" ON "rotable_repair_orders"("workOrderId");

-- CreateIndex
CREATE INDEX "rotable_repair_orders_failureCodeId_idx" ON "rotable_repair_orders"("failureCodeId");

-- AddForeignKey
ALTER TABLE "maintenance_work_orders" ADD CONSTRAINT "maintenance_work_orders_rotableEquipmentId_fkey" FOREIGN KEY ("rotableEquipmentId") REFERENCES "rotable_equipments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_repair_orders" ADD CONSTRAINT "rotable_repair_orders_rotableId_fkey" FOREIGN KEY ("rotableId") REFERENCES "rotable_equipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_repair_orders" ADD CONSTRAINT "rotable_repair_orders_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_repair_orders" ADD CONSTRAINT "rotable_repair_orders_failureCodeId_fkey" FOREIGN KEY ("failureCodeId") REFERENCES "failure_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
