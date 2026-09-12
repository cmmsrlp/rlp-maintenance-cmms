-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('OK', 'ATTENTION', 'CRITICAL');

-- CreateTable
CREATE TABLE "client_insights" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_insights_clientId_key" ON "client_insights"("clientId");

-- AddForeignKey
ALTER TABLE "client_insights" ADD CONSTRAINT "client_insights_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
