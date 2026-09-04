-- Duas pessoas cobradas separadamente podem legitimamente dividir um
-- WhatsApp (telefone de casa). O cadastro passa a avisar e deixar o
-- operador escolher em vez de recusar. Troca a unicidade por um índice
-- normal — a busca por telefone continua indexada.
DROP INDEX "customers_phone_key";

-- CreateIndex
CREATE INDEX "customers_phone_idx" ON "customers"("phone");
