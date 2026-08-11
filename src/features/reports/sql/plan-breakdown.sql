SELECT
  p.id AS "id", p.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN subscriptions sub ON sub.id = ch."subscriptionId"
JOIN plans p ON p.id = sub."planId"
WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
  AND ch.status <> 'CANCELLED'
GROUP BY p.id, p.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
