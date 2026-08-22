-- Aditiva: nullable, sem default forçado. `metaTemplateName` guarda o nome do
-- template já aprovado na Meta pra este passo. Enquanto for null, o motor
-- (`evaluate.ts`) trata um passo SEND_MESSAGE num canal `requiresApprovedTemplate`
-- como SKIPPED (motivo `template_not_approved`) em vez de tentar texto livre que
-- a Meta recusa fora da janela de 24h. Ver docs/projeto/tecnico/06-regua-e-canais.md.
ALTER TABLE "dunning_steps" ADD COLUMN "metaTemplateName" TEXT;
