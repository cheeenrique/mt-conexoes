-- Aditiva: nullable, sem default forçado. Carimbo da última passada do motor
-- (`evaluateDunningRule`) para esta régua, e os dois contadores honestos que a
-- linha de resumo da tela consegue afirmar sem inventar número:
-- `lastRunMessagesSent` (Message novas criadas nesta passada — sempre 0 numa
-- passada em REVIEW, que nunca cria Message) e `lastRunPendingReview` (passos
-- que viraram PENDING_REVIEW nesta passada — só cresce em REVIEW, ACTIVE nunca
-- produz este outcome). DRAFT nunca escreve aqui (o motor não avalia rascunho);
-- PAUSED também não (não roda), então mantém o carimbo de antes de pausar.
ALTER TABLE "dunning_rules" ADD COLUMN "lastRunAt" TIMESTAMP(3);
ALTER TABLE "dunning_rules" ADD COLUMN "lastRunMessagesSent" INTEGER;
ALTER TABLE "dunning_rules" ADD COLUMN "lastRunPendingReview" INTEGER;
