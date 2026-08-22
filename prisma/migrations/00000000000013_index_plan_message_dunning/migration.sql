-- Três índices medidos com EXPLAIN ANALYZE em volume real, não por antecipação.
-- Todos aditivos: nenhuma coluna muda, nenhum dado é reescrito, rollback é DROP INDEX.

-- 1) listPlans conta assinaturas ativas por plano com
--    `groupBy(['planId'], where: { planId: { in: [...] }, status: 'ACTIVE' })`.
--    `subscriptions.planId` não tinha índice nenhum — `supplierId` tinha, `planId` não.
--
--    Composto, não simples: o filtro real é `planId IN (...) AND status = 'ACTIVE'`.
--    Medido em 20k assinaturas / 60 planos / página de 12:
--      sem índice           Seq Scan, 16.826 linhas descartadas ......... 2,581 ms
--      só (planId)          Bitmap, 3.954 no índice, 780 no recheck ..... 2,434 ms
--      (planId, status)     Bitmap, 3.174 no índice, recheck vazio ...... 1,204 ms
--    O `status` na segunda posição tira 780 linhas do heap fetch, não do filtro.
--
--    ⚠️ `supplierId` foi medido no mesmo cenário e ficou como está: virar
--    `(supplierId, status)` mexeu em 3 de 687 heap blocks (1,03 ms vs 1,09 ms,
--    dentro do ruído). O agregado lê `priceCents`/`costCents` do heap de qualquer
--    jeito, então o filtro de status não evita página nenhuma. Índice a mais custa
--    escrita em toda assinatura criada; não se paga aqui.
CREATE INDEX "subscriptions_planId_status_idx" ON "subscriptions"("planId", "status");

-- 2) A tela de Mensagens filtra, ordena e agrupa por `occurredAt = sentAt ?? createdAt`,
--    que em SQL vira `sentAt BETWEEN ... OR (sentAt IS NULL AND createdAt BETWEEN ...)`.
--    Nenhum dos índices existentes (`status,scheduledFor` e `customerId,createdAt`)
--    cobre a listagem global por data.
--
--    Medido em 33.747 mensagens, janela de 20 dias (769 linhas):
--      antes    Seq Scan, 32.978 descartadas, 1.050 buffers ..... 5,816 ms
--      depois   BitmapOr nos DOIS ramos, 612 buffers ............ 0,815 ms   (7,1x)
--
--    O composto é o que faz os dois ramos usarem o mesmo índice: `sentAt` como
--    range no primeiro, `sentAt IS NULL` como igualdade + `createdAt` como range
--    no segundo. Um índice só em `createdAt` foi testado e o planner ignorou —
--    continuou Seq Scan em 5,598 ms.
--
--    ASC e não `DESC NULLS LAST`: as três formas foram medidas lado a lado e deram
--    plano idêntico, 603 heap blocks idênticos e 1048 kB idênticos, porque o índice
--    nunca satisfaz a ordenação (o `ORDER BY createdAt DESC` é um quicksort à parte
--    em todas). Sendo empate, fica a forma que o `schema.prisma` expressa — uma
--    garantia a menos vivendo só na migration.
CREATE INDEX "messages_sentAt_createdAt_idx" ON "messages"("sentAt", "createdAt");

-- 3) ⚠️ SQL manual — `schema.prisma` não expressa índice parcial (ver prisma/README.md).
--
--    A mesma tela lê as execuções da régua que pararam antes de virar mensagem:
--    `messageId IS NULL AND outcome IN ('SKIPPED','PENDING_REVIEW')`. Não existe, e
--    nunca vai existir, linha em `messages` para esses casos — por isso a tela precisa
--    ler daqui, e por isso `messageId IS NULL` está em 100% das execuções da query.
--
--    Medido em 10.660 execuções, régua em REVIEW (82% sem mensagem), janela de 60 dias:
--      antes            Seq Scan, 9.963 descartadas ................. 1,267 ms
--      não parcial      Bitmap, índice de 344 kB .................... 0,340 ms
--      parcial          Bitmap, índice de 120 kB .................... 0,233 ms   (5,4x)
--
--    O parcial é o ponto: em tempo ele empata com o não parcial, mas ocupa 1/3 do
--    tamanho porque as execuções `QUEUED` — que têm `messageId` e nunca casam com o
--    predicado — ficam de fora. Índice menor é menos escrita em toda passada da régua,
--    que é justamente o job que mais insere nesta tabela.
CREATE INDEX "dunning_executions_pending_idx"
  ON "dunning_executions"("outcome", "createdAt" DESC)
  WHERE "messageId" IS NULL;
