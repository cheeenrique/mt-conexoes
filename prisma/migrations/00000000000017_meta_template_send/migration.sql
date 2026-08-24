-- Aditiva: nullable, sem default forçado. Liga o envio por template aprovado do
-- canal Meta Cloud — até aqui `metaTemplateName` só documentava a aprovação
-- (ver migration 15), nada preenchia `templateRef` na hora de enviar.
--
-- `dunning_steps.metaTemplateParams` guarda o mapeamento posicional das
-- variáveis do template aprovado (array JSON de nomes de `TemplateVariable`,
-- índice 0 = {{1}} na Meta), derivado automaticamente das variáveis usadas em
-- `templateBody` ao salvar o passo — não é campo editável à parte, pra não
-- deixar o texto aprovado na Meta e a ordem dos parâmetros divergirem.
--
-- `messages.templateName`/`templateParams` congelam, na avaliação, qual
-- template e quais valores foram usados neste envio específico — mesmo
-- princípio de `body` já congelado, nunca recalculado no despacho.
ALTER TABLE "dunning_steps" ADD COLUMN "metaTemplateParams" JSONB;
ALTER TABLE "messages" ADD COLUMN "templateName" TEXT;
ALTER TABLE "messages" ADD COLUMN "templateParams" JSONB;
