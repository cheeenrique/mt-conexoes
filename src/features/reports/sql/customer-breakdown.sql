SELECT
  c.id AS "id", c.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN customers c ON c.id = ch."customerId"
WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
  AND ch.status <> 'CANCELLED'
GROUP BY c.id, c.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
