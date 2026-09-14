-- CreateEnum
CREATE TYPE "RotableEquipmentStatus" AS ENUM ('IN_STOCK', 'INSTALLED', 'IN_RECONDITIONING', 'SCRAPPED');

-- CreateTable
CREATE TABLE "rotable_equipments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "specificAttributes" JSONB,
    "status" "RotableEquipmentStatus" NOT NULL DEFAULT 'IN_STOCK',
    "currentInstrumentId" TEXT,
    "acquisitionDate" TIMESTAMP(3),
    "acquisitionCost" DOUBLE PRECISION,
    "photoKey" TEXT,
    "photoFileName" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "rotable_equipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotable_installations" (
    "id" TEXT NOT NULL,
    "rotableId" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "installedById" TEXT,
    "removedById" TEXT,
    "removalReason" TEXT,
    "workOrderId" TEXT,
    "notes" TEXT,

    CONSTRAINT "rotable_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotable_reconditionings" (
    "id" TEXT NOT NULL,
    "rotableId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "vendor" TEXT,
    "cost" DOUBLE PRECISION,
    "result" TEXT,
    "notes" TEXT,
    "sentById" TEXT,
    "receivedById" TEXT,

    CONSTRAINT "rotable_reconditionings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rotable_equipments_clientId_idx" ON "rotable_equipments"("clientId");

-- CreateIndex
CREATE INDEX "rotable_equipments_status_idx" ON "rotable_equipments"("status");

-- CreateIndex
CREATE INDEX "rotable_equipments_currentInstrumentId_idx" ON "rotable_equipments"("currentInstrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "rotable_equipments_clientId_code_key" ON "rotable_equipments"("clientId", "code");

-- CreateIndex
CREATE INDEX "rotable_installations_rotableId_idx" ON "rotable_installations"("rotableId");

-- CreateIndex
CREATE INDEX "rotable_installations_instrumentId_idx" ON "rotable_installations"("instrumentId");

-- CreateIndex
CREATE INDEX "rotable_installations_workOrderId_idx" ON "rotable_installations"("workOrderId");

-- CreateIndex
CREATE INDEX "rotable_reconditionings_rotableId_idx" ON "rotable_reconditionings"("rotableId");

-- AddForeignKey
ALTER TABLE "rotable_equipments" ADD CONSTRAINT "rotable_equipments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_equipments" ADD CONSTRAINT "rotable_equipments_currentInstrumentId_fkey" FOREIGN KEY ("currentInstrumentId") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_installations" ADD CONSTRAINT "rotable_installations_rotableId_fkey" FOREIGN KEY ("rotableId") REFERENCES "rotable_equipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_installations" ADD CONSTRAINT "rotable_installations_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_installations" ADD CONSTRAINT "rotable_installations_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rotable_reconditionings" ADD CONSTRAINT "rotable_reconditionings_rotableId_fkey" FOREIGN KEY ("rotableId") REFERENCES "rotable_equipments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
