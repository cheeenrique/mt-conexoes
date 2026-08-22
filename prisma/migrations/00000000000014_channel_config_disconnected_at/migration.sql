-- Aditiva: nullable, sem default forçado. `disconnectedAt` guarda quando o webhook
-- `connection.update` reportou `state: 'close'` pela última vez (null enquanto o canal
-- está conectado). Não é derivável de `lastCheckAt` — aquele é "quando testamos",
-- este é "desde quando caiu", o dado que o dashboard usa pra avisar o operador.
ALTER TABLE "channel_configs" ADD COLUMN "disconnectedAt" TIMESTAMP(3);
