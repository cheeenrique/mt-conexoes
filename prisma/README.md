# Prisma

`schema.prisma` não é a fonte única da verdade. Índice parcial, `CHECK` e o singleton de
`settings` (quando existir) entram como SQL manual na migration, porque o Prisma Migrate
não os expressa. Ver `docs/projeto/tecnico/02-modelo-de-dados.md`.

Migration aplicada é imutável — corrigir é migration nova, nunca editar uma existente.
