-- $1 = início do mês em UTC, $2 = início do mês seguinte em UTC (monthBoundsUtc, nunca date_trunc).
SELECT
  COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
  COALESCE(SUM("principalCents" - "discountCents")
           FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "openCents",
  COALESCE(SUM("costCents")
           FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "costAtRiskCents"
FROM charges
WHERE "dueAt" >= $1 AND "dueAt" < $2
  AND status <> 'CANCELLED';
