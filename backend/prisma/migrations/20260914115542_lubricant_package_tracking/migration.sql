-- AlterTable
ALTER TABLE "lubricants" ADD COLUMN     "openPackageOpenedAt" TIMESTAMP(3),
ADD COLUMN     "openPackageRemaining" DOUBLE PRECISION,
ADD COLUMN     "packageSize" DOUBLE PRECISION;
