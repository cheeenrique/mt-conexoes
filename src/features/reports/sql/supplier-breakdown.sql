SELECT
  ch."supplierId" AS "id", COALESCE(s.name, 'Sem fornecedor') AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
LEFT JOIN suppliers s ON s.id = ch."supplierId"
WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
  AND ch.status <> 'CANCELLED'
GROUP BY ch."supplierId", s.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
