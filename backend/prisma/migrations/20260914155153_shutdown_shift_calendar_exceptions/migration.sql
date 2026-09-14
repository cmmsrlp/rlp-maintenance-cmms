-- AlterTable
ALTER TABLE "shutdown_schedules" ADD COLUMN     "dateExceptions" JSONB,
ADD COLUMN     "shift24h" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shiftEnd" TEXT DEFAULT '17:00',
ADD COLUMN     "shiftStart" TEXT DEFAULT '07:00';
