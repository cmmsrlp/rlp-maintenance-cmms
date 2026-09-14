-- AlterTable
ALTER TABLE "shutdown_schedules" ADD COLUMN     "hoursPerDay" DOUBLE PRECISION NOT NULL DEFAULT 8,
ADD COLUMN     "workingWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[];

-- AlterTable
ALTER TABLE "shutdown_tasks" ADD COLUMN     "lagDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "predecessorTaskId" TEXT;

-- AddForeignKey
ALTER TABLE "shutdown_tasks" ADD CONSTRAINT "shutdown_tasks_predecessorTaskId_fkey" FOREIGN KEY ("predecessorTaskId") REFERENCES "shutdown_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
