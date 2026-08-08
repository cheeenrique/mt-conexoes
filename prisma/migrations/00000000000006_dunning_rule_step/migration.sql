-- CreateEnum
CREATE TYPE "DunningStatus" AS ENUM ('DRAFT', 'REVIEW', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "DunningAction" AS ENUM ('SEND_MESSAGE', 'SUSPEND', 'NOTIFY_OWNER');

-- CreateTable
CREATE TABLE "dunning_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DunningStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunning_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dunning_steps" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "action" "DunningAction" NOT NULL DEFAULT 'SEND_MESSAGE',
    "templateBody" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dunning_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dunning_steps_ruleId_offsetDays_key" ON "dunning_steps"("ruleId", "offsetDays");

-- AddForeignKey
ALTER TABLE "dunning_steps" ADD CONSTRAINT "dunning_steps_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "dunning_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No máximo uma régua padrão
CREATE UNIQUE INDEX dunning_rules_single_default ON dunning_rules ("isDefault")
  WHERE "isDefault" = true;
