SELECT
  s.id AS "id", s.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN suppliers s ON s.id = ch."supplierId"
WHERE ch."dueAt" >= $1 AND ch."dueAt" < $2
  AND ch.status <> 'CANCELLED'
GROUP BY s.id, s.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
