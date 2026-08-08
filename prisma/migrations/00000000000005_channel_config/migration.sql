-- CreateEnum
CREATE TYPE "ChannelProvider" AS ENUM ('META_CLOUD', 'EVOLUTION', 'SALVY');

-- CreateTable
CREATE TABLE "channel_configs" (
    "id" TEXT NOT NULL,
    "provider" "ChannelProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "phoneNumber" TEXT,
    "credentials" TEXT NOT NULL,
    "riskAcceptedAt" TIMESTAMP(3),
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_configs_provider_key" ON "channel_configs"("provider");

-- No máximo um canal padrão
CREATE UNIQUE INDEX channel_configs_single_default ON channel_configs ("isDefault")
  WHERE "isDefault" = true;
