-- Faturado, custo e contagem por status, excluindo cobrança cancelada.
SELECT
  COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
  COUNT(*)::int                                               AS "chargesCount",
  COUNT(*) FILTER (WHERE status = 'PAID')::int                AS "paidCount",
  COUNT(*) FILTER (WHERE status = 'OVERDUE')::int              AS "overdueCount",
  COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_PAID'))::int AS "openCount"
FROM charges
WHERE "customerId" = $1
  AND status <> 'CANCELLED';

-- Recebido: soma de pagamentos de todas as cobranças do cliente (join, não coluna em charges).
-- Sem filtro de status: cobrança com pagamento registrado nunca é cancelada (regra dura do domínio),
-- então incluir CANCELLED aqui não muda o resultado — mas deixamos explícito pra não parecer omissão.
SELECT COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents"
FROM payments p
JOIN charges ch ON ch.id = p."chargeId"
WHERE ch."customerId" = $1;
