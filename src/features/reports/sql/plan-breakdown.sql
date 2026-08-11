SELECT
  sub."planId" AS "id", COALESCE(p.name, 'Sem plano') AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN subscriptions sub ON sub.id = ch."subscriptionId"
LEFT JOIN plans p ON p.id = sub."planId"
WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
  AND ch.status <> 'CANCELLED'
GROUP BY sub."planId", p.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
