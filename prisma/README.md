# Prisma

`schema.prisma` não é a fonte única da verdade. Índice parcial, `CHECK` e o singleton de
`settings` (quando existir) entram como SQL manual na migration, porque o Prisma Migrate
não os expressa. Ver `docs/projeto/tecnico/02-modelo-de-dados.md`.

Migration aplicada é imutável — corrigir é migration nova, nunca editar uma existente.

## Dois bancos: dev e teste

`docker-compose.yml` sobe **dois** Postgres, cada um com seu próprio volume — não são a
mesma instância com dois nomes:

| Banco | Serviço | Porta host | Usa | `DATABASE_URL` em |
|---|---|---|---|---|
| Dev | `db` | `5442` | `pnpm dev`, `pnpm db:seed`, `pnpm db:seed:demo` | `.env.local` → `DATABASE_URL` |
| Teste | `db-test` | `5443` | `pnpm test:integration` | `.env.local` → `TEST_DATABASE_URL` |

⚠️ **Por que existem dois.** `pnpm test:integration` afirma totais globais em mais de uma
suíte (`getMonthlySummary`, `getSupplierBreakdown` — ver `.claude/rules/06-testes.md`).
Antes da separação, os dois usavam a mesma `DATABASE_URL`: semear 5 clientes pra olhar a
tela de Clientes no navegador quebrou 10 testes de agregação, e uma sessão que morreu no
meio de um seed deixou linha órfã que fazia suítes falharem de forma **não
determinística** em execuções seguintes — sem relação nenhuma com o código sob teste.
Detalhe completo no histórico de antipadrões deste repo.

### Preparar cada um

```bash
# Dev — o que pnpm dev usa
docker compose up -d db
pnpm db:migrate          # aplica as migrations
pnpm db:seed             # usuário, settings, régua padrão (idempotente)
pnpm db:seed:demo        # opcional: fornecedor, planos e um exemplar de cada estado (ver abaixo)

# Teste — o que pnpm test:integration usa
docker compose up -d db-test
pnpm db:migrate:test     # mesmas migrations, banco separado
pnpm db:seed:test        # mesma base (usuário/settings/régua) — as suítes esperam ela pronta
```

`db:migrate:test` e `db:seed:test` rodam o comando real (`prisma migrate deploy` /
`prisma/seed.ts`) com `DATABASE_URL` trocado só no processo filho — implementado em
`scripts/with-test-db.ts`, sem tocar no `.env.local` nem no `DATABASE_URL` de dev.

### Regra dura

**Nunca rode `prisma/seed-demo.ts` (ou `pnpm db:seed:demo`) contra o banco de teste.**
`tests/setup-integration.ts` prefere `TEST_DATABASE_URL`; se ela não estiver definida,
cai para `DATABASE_URL` com um aviso — o que reintroduz exatamente o problema que a
separação existe pra evitar. `prisma/seed-demo.ts` só lê `DATABASE_URL` e se recusa a
rodar se `DATABASE_URL` e `TEST_DATABASE_URL` apontarem pro mesmo banco.

Precisou de dado pra olhar uma tela e usou sem querer o banco errado? Apague pelo nome/
telefone com uma marca única — as FKs de `messages`, `dunning_executions` e
`credential_reveals` obrigam apagar na ordem — e rode `pnpm test:integration` de novo
antes de considerar terminado.

## O que `pnpm db:seed:demo` semeia

Além do fornecedor "Painel P2P" e dos 4 planos, o script cria 8 clientes fixos
(`demo-customer-01`..`08`, nome sempre prefixado `Demo ·`) — um exemplar de cada
situação que `resolveCustomerSituation` sabe devolver, cada status de cobrança que o
enum `ChargeStatus` tem, e um exemplar de cada faixa de margem que `classifyMarginTone`
distingue:

| Cliente | Situação | Cobrança viva | Margem | Observação |
|---|---|---|---|---|
| `demo-customer-01` | `ACTIVE` | nenhuma (fechadas) | saudável (71%) | tem `Charge` `CANCELLED` e `PAID` históricas, cada uma com `costCents` congelado num valor diferente — prova que o custo não é recalculado |
| `demo-customer-02` | `DUE_TODAY` | `OPEN`, vence hoje | apertada (25%) | mensagem `SENT` da régua (D0) |
| `demo-customer-03` | `OVERDUE` | `OVERDUE`, D+3 | crítica (~10%) | preço R$ 33,33 (dízima); mensagem `FAILED` (`body_too_long`) |
| `demo-customer-04` | `OPEN` | `OPEN`, D-2 | saudável | mensagem `CANCELLED` por `stale` (>24h na fila) |
| `demo-customer-05` | `SUSPENDED` | `OVERDUE`, D+5, por baixo | saudável | prova que assinatura suspensa manda na situação mesmo com cobrança vencida |
| `demo-customer-06` | `OPEN` | `PARTIALLY_PAID`, vence no futuro | saudável | `Payment` de R$ 0,01 — o valor mínimo que já quebrou sistema |
| `demo-customer-07` | `NO_SUBSCRIPTION` | — | — | cadastrado, nunca teve assinatura |
| `demo-customer-08` | `OVERDUE` | `OVERDUE`, D+1 | saudável | sem telefone (`phone: null`); `DunningExecution` `SKIPPED` (`no_phone`) que **nunca** virou `Message` — cobre a metade da tela de Mensagens que não vem de `messages` |

Também semeia 4 `Lead` fixos (`demo-lead-new/contacted/converted/discarded`), um por
valor de `LeadStatus` — o convertido aponta pra `demo-customer-01`.

Datas nascem sempre relativas a `now` no fuso de `Settings.timezone` (nunca fixas):
"vence hoje" continua vencendo hoje em qualquer dia que o script rodar. Rodar duas
vezes dá o mesmo resultado — todo registro de demonstração tem `id` fixo (`demo-...`)
e o script faz upsert por `id`, no mesmo espírito de `settings` (`"singleton"`) e
`dunningRule` (`"default-rule"`) em `seed.ts`. `Customer` não tem `name` nem `phone`
estáveis o bastante pra virar chave aqui — o telefone, por exemplo, muda de propósito
entre os cenários (`demo-customer-08` testa cliente sem telefone).

Precisa da régua padrão (`pnpm db:seed`) já semeada: o script lê os passos de
`default-rule` pra anexar `DunningExecution` realista às mensagens e recusa rodar com
uma mensagem de erro explícita se não encontrar.

## Valores de enum sem código correspondente

`ChannelProvider` ainda carrega `SALVY`, e não existe mais adapter para ele: o canal Salvy foi
removido do produto. **O valor fica no enum de propósito.** Remover valor de enum no Postgres é
migration destrutiva (recriar o tipo, reescrever a coluna, com lock de tabela) por benefício
zero — sem entrada no registro de adapters, `SALVY` é inalcançável pela aplicação:

- `CHANNEL_PROVIDERS` não o lista, então ele não aparece na tela de Canais nem em
  `listChannelConfigs()`.
- As buscas de canal padrão (`dispatch.ts`, `scheduled-dispatch.ts`, `getChannelDownAlert`)
  filtram por `provider: { in: CHANNEL_PROVIDERS }` — linha antiga marcada como padrão não entra
  no despacho.
- `resolveAdapter('SALVY')` lança `UnsupportedChannelError` em vez de devolver `undefined`.

Linha antiga em `channel_configs` com esse provider, se existir, é dado morto: não é lida por
nada e pode ser apagada à mão quando alguém quiser. Não vale uma migration.
