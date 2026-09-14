-- CreateEnum
CREATE TYPE "CriticalityClass" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "CriticalityOrigin" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "CriticalityTrend" AS ENUM ('UP', 'DOWN', 'STABLE');

-- CreateEnum
CREATE TYPE "CriticalityChangeTrigger" AS ENUM ('INITIAL', 'OS_CLOSED_WITH_FAILURE', 'HOURS_UPDATED', 'EQUIPMENT_MOVED', 'MANUAL_REVIEW');

-- CreateTable
CREATE TABLE "asset_criticalities" (
    "id" TEXT NOT NULL,
    "instrumentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "safetyScore" INTEGER NOT NULL DEFAULT 1,
    "safetyNotes" TEXT,
    "safetyUpdatedAt" TIMESTAMP(3),
    "productionScore" INTEGER NOT NULL DEFAULT 1,
    "productionNotes" TEXT,
    "productionUpdatedAt" TIMESTAMP(3),
    "failureScore" INTEGER,
    "failureScoreOrigin" "CriticalityOrigin" NOT NULL DEFAULT 'AUTO',
    "failureOverrideReason" TEXT,
    "failureOverrideAt" TIMESTAMP(3),
    "previousFailureScore" INTEGER,
    "consequenceScore" INTEGER,
    "criticalityIndex" INTEGER,
    "criticalityClass" "CriticalityClass",
    "trend" "CriticalityTrend",
    "mtbfHours" DOUBLE PRECISION,
    "failureCount12m" INTEGER,
    "operatingHours12m" DOUBLE PRECISION,
    "lastCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_criticalities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_criticality_logs" (
    "id" TEXT NOT NULL,
    "criticalityId" TEXT NOT NULL,
    "trigger" "CriticalityChangeTrigger" NOT NULL,
    "origin" "CriticalityOrigin" NOT NULL,
    "safetyScore" INTEGER NOT NULL,
    "productionScore" INTEGER NOT NULL,
    "failureScore" INTEGER,
    "criticalityIndex" INTEGER,
    "criticalityClass" "CriticalityClass",
    "reason" TEXT,
    "responsibleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_criticality_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asset_criticalities_instrumentId_key" ON "asset_criticalities"("instrumentId");

-- CreateIndex
CREATE INDEX "asset_criticalities_clientId_idx" ON "asset_criticalities"("clientId");

-- CreateIndex
CREATE INDEX "asset_criticalities_criticalityClass_idx" ON "asset_criticalities"("criticalityClass");

-- CreateIndex
CREATE INDEX "asset_criticality_logs_criticalityId_idx" ON "asset_criticality_logs"("criticalityId");

-- AddForeignKey
ALTER TABLE "asset_criticalities" ADD CONSTRAINT "asset_criticalities_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_criticalities" ADD CONSTRAINT "asset_criticalities_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_criticality_logs" ADD CONSTRAINT "asset_criticality_logs_criticalityId_fkey" FOREIGN KEY ("criticalityId") REFERENCES "asset_criticalities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_criticality_logs" ADD CONSTRAINT "asset_criticality_logs_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
