-- Aditiva. "Remover" na tabela de clientes — soft delete, não o direito de
-- eliminação da LGPD. `deletedAt` some da lista e para a régua de cobrar; dado
-- (nome, telefone, credencial) continua intacto. Quem precisa apagar dado de
-- verdade usa `anonymizedAt` (migration 00000000000018).
ALTER TABLE "customers" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "customers_deletedAt_idx" ON "customers"("deletedAt");
