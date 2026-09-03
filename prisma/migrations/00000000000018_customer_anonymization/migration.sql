-- Aditiva, sem default forçado. Direito de eliminação (LGPD) — design fechado em
-- docs/superpowers/specs/2026-08-25-anonimizacao-lgpd-design.md.
--
-- `anonymizedAt` é o que separa cliente normal de cliente anonimizado: `null`
-- enquanto ninguém pediu eliminação, carimbo quando alguém pediu. É lido pela
-- ficha (troca pra modo leitura), pela lista (esconde por padrão) e pelos
-- guards de dunning-evaluate/messages-dispatch (nunca mandam mensagem pra quem
-- já foi anonimizado).
--
-- `anonymizedByUserId` é a auditoria — coluna, não tabela própria: o painel
-- tem um usuário só e o evento ocorre no máximo uma vez por cliente.
ALTER TABLE "customers" ADD COLUMN     "anonymizedAt" TIMESTAMP(3),
ADD COLUMN     "anonymizedByUserId" TEXT;

-- CreateIndex
CREATE INDEX "customers_anonymizedAt_idx" ON "customers"("anonymizedAt");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_anonymizedByUserId_fkey" FOREIGN KEY ("anonymizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
