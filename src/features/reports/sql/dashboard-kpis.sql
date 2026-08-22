-- KPIs do Início. ${todayStart} = 00:00 local de hoje em UTC, ${tomorrowStart} = 00:00 local de amanhã.
-- Ambos saem de startOfLocalDay(...), nunca de date_trunc em UTC.
--
-- `dueAt` é gravado como 23:59:59.999 local, então "vence hoje" é
-- [todayStart, tomorrowStart) e "em atraso" é tudo antes de todayStart.
-- O valor é o que falta receber (líquido menos pagamentos), igual à faixa de vencimentos.
WITH open_charges AS (
  SELECT
    ch."dueAt" AS "dueAt",
    ch."principalCents" - ch."discountCents" - COALESCE(SUM(p."amountCents"), 0) AS "outstandingCents"
  FROM charges ch
  LEFT JOIN payments p ON p."chargeId" = ch.id
  WHERE ch.status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')
  GROUP BY ch.id, ch."dueAt", ch."principalCents", ch."discountCents"
)
SELECT
  COUNT(*) FILTER (WHERE "dueAt" >= ${todayStart} AND "dueAt" < ${tomorrowStart})::int AS "dueTodayCount",
  COALESCE(SUM("outstandingCents") FILTER (WHERE "dueAt" >= ${todayStart} AND "dueAt" < ${tomorrowStart}), 0)::text AS "dueTodayCents",
  COUNT(*) FILTER (WHERE "dueAt" < ${todayStart})::int AS "overdueCount",
  COALESCE(SUM("outstandingCents") FILTER (WHERE "dueAt" < ${todayStart}), 0)::text AS "overdueCents"
FROM open_charges;

-- Margem média: média simples das margens das assinaturas ativas, não a margem da soma.
-- Somar preço de MENSAL com preço de ANUAL daria peso 12x ao anual. A margem de cada
-- assinatura já é independente do ciclo, então a média das margens é a leitura honesta.
-- `numeric` (exato), nunca float — percentual vira Decimal na borda.
SELECT
  COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS "activeSubscriptionsCount",
  COUNT(*) FILTER (WHERE status = 'SUSPENDED')::int AS "suspendedSubscriptionsCount",
  (AVG((("priceCents" - "costCents")::numeric / "priceCents") * 100)
     FILTER (WHERE status = 'ACTIVE' AND "priceCents" > 0))::text AS "averageMarginPercent"
FROM subscriptions
WHERE status IN ('ACTIVE', 'SUSPENDED');
