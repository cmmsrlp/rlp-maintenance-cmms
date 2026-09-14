-- CreateEnum
CREATE TYPE "ShutdownScheduleStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "shutdown_schedules" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ShutdownScheduleStatus" NOT NULL DEFAULT 'PLANNING',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "shutdown_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shutdown_tasks" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "parentTaskId" TEXT,
    "name" TEXT NOT NULL,
    "instrumentId" TEXT,
    "workOrderId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "percentComplete" INTEGER NOT NULL DEFAULT 0,
    "resources" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shutdown_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shutdown_schedules_clientId_idx" ON "shutdown_schedules"("clientId");

-- CreateIndex
CREATE INDEX "shutdown_tasks_scheduleId_idx" ON "shutdown_tasks"("scheduleId");

-- CreateIndex
CREATE INDEX "shutdown_tasks_parentTaskId_idx" ON "shutdown_tasks"("parentTaskId");

-- CreateIndex
CREATE INDEX "shutdown_tasks_instrumentId_idx" ON "shutdown_tasks"("instrumentId");

-- CreateIndex
CREATE INDEX "shutdown_tasks_workOrderId_idx" ON "shutdown_tasks"("workOrderId");

-- AddForeignKey
ALTER TABLE "shutdown_schedules" ADD CONSTRAINT "shutdown_schedules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shutdown_tasks" ADD CONSTRAINT "shutdown_tasks_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "shutdown_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shutdown_tasks" ADD CONSTRAINT "shutdown_tasks_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "shutdown_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shutdown_tasks" ADD CONSTRAINT "shutdown_tasks_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "instruments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shutdown_tasks" ADD CONSTRAINT "shutdown_tasks_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "maintenance_work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
