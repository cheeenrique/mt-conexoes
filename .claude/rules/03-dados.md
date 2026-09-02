# 03 — Dados (Prisma, migrations, performance)

## Acesso

- Cliente Prisma singleton em `lib/db.ts`. ❌ `new PrismaClient()` dentro de módulo — no Cloud Run isso vaza conexão a cada hot reload e a cada instância nova.
- SQL cru: só `$queryRaw` **parametrizado** ou TypedSQL. `$queryRawUnsafe` não passa em review, sem exceção.
- Relatório e agregação vivem em `features/reports/sql/*.sql`, não em template string dentro do service.

## Convenções de schema

- Dinheiro: `BigInt`, sufixo `Cents`. Percentual: `Decimal`. **Nunca `Float` para valor monetário**, nem em coluna de apoio.
- Data: `DateTime` UTC, sufixo `At`. Data sem hora: `@db.Date`.
- Id: `uuid(7)` — ordenável por tempo, bom para índice.
- Tabela `snake_case` plural via `@@map`, modelo `PascalCase` singular.
- ❌ **Coluna de saldo.** Total pago é `SUM(payments)`. Receita é `SUM` sobre `charges`.
- Documento financeiro emitido é imutável: não existe `UPDATE` que altere valor de cobrança com pagamento registrado. Correção é registro novo.
- Soft delete só onde há valor histórico. **Nunca como substituto de anonimização** — o direito de eliminação exige `anonymizeCustomer()` de verdade.

## Migrations

- Migration aplicada é **imutável**. Corrigir é migration nova.
- **Índice parcial, `CHECK` e o singleton de `settings` entram como SQL manual** — o `schema.prisma` não expressa nada disso, e a lista completa está em `docs/projeto/tecnico/02-modelo-de-dados.md`. Registrar em `prisma/README.md` que o schema não é a fonte única da verdade.
- Migration destrutiva usa **expand/contract**: adiciona → migra dado → passa a ler do novo → remove numa migration posterior. Nunca `DROP COLUMN` no mesmo deploy que para de escrever nela.
- Rename de coluna com dado em produção é expand/contract, não `@map` esperto.
- Migration roda no banco de dev antes de ir para produção. Sempre.

## Constraints que o código não pode substituir

Estas moram no banco porque `if` no código não sobrevive a duas execuções concorrentes do cron:

| Garantia | Constraint |
|---|---|
| Uma cobrança por ciclo | `@@unique([subscriptionId, periodStart])` |
| Um passo da régua por cobrança | `@@unique([chargeId, stepId])` |
| Uma mensagem de cobrança por cliente por dia | índice único parcial em `messages (customer_id, scheduled_date)` |
| Um canal padrão | índice único parcial em `channel_configs (is_default)` |
| Telefone único por cliente | `@@unique([phone])` — sustenta opt-out e dedupe |
| Dinheiro não-negativo | `CHECK (amount_cents > 0)` e afins |

⚠️ Escrever a checagem só em TypeScript e não no banco é o jeito de descobrir, meses depois, que existem duas cobranças para o mesmo mês.

## Índices e performance

- Toda query nova de lista ou relatório: conferir `EXPLAIN` antes de mesclar. Seq scan em `charges` ou `messages` é bloqueio.
- Índice acompanha o filtro real: `@@index([status, dueAt])` porque a query filtra nessa ordem.
- **N+1 não passa.** `await` de query dentro de `for`/`map` é o padrão a caçar em review — resolver com `in`, `include` ou uma query agregada.
- Paginação por **cursor** nas listas de cobrança e mensagem. `skip` grande degrada e pula linha quando o dado muda durante a navegação.
- Lote de importação processa em blocos de ~500 linhas, cada bloco em transação própria.

Na escala do projeto (até 1.000 assinantes) quase nada disso vira gargalo. A disciplina existe porque N+1 e seq scan aparecem quando a base cresce, e aí o custo de encontrar é alto.

## Conexões no Cloud Run

- Container, não função por requisição — pool normal do Prisma serve.
- A instância é `db-f1-micro`, com `max_connections=25`. O pool do Prisma abre (nº de CPUs × 2 + 1) por instância e o Cloud Run escala até 3 — sem `connection_limit` explícito na `DATABASE_URL`, uma passada de cron junto com a tela esgota as conexões do banco.
- Job de cron e requisição de UI compartilham o mesmo pool. Job que segura conexão por minutos trava a tela.

## Dados nos ambientes

⚠️ Base real só entra no ambiente do cliente, no fim do projeto. Durante o desenvolvimento, dados anonimizados — a base tem telefone e credencial de centenas de pessoas.
