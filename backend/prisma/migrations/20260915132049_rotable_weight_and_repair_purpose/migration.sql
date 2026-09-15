-- CreateEnum
CREATE TYPE "RotableRepairPurpose" AS ENUM ('REPAIR', 'WARRANTY', 'SIMPLE_SHIPMENT');

-- AlterTable
ALTER TABLE "rotable_equipments" ADD COLUMN     "weightKg" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "rotable_repair_orders" ADD COLUMN     "purpose" "RotableRepairPurpose" NOT NULL DEFAULT 'REPAIR';
