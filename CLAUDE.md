# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estado atual do repositório

**Só existe `docs/`. Não há código, `package.json`, lockfile, CI nem migrations.** O projeto está na fase de especificação — as decisões de stack e de domínio estão fechadas (ver `docs/README.md` → "Decisões travadas") e o próximo passo é a Fase 0 do roadmap (`docs/16-roadmap-mvp.md`).

Consequências práticas:

- Não existem comandos de build/lint/test para rodar. Não invente scripts nem alegue que rodou algum.
- Ao criar o código, o scaffolding é **pnpm workspaces + Turborepo**, com os apps/packages exatos de `docs/03-arquitetura-e-adrs.md#monorepo`. Não improvisar outra estrutura.
- Mudança de decisão de arquitetura = **novo ADR** em `docs/03-arquitetura-e-adrs.md` que supersede o anterior. Nunca editar ADR existente.

O idioma do repositório é **pt-BR** (docs, mensagens de erro ao usuário final, UI). Código, identificadores e commits em inglês.

---

## O produto em uma frase

SaaS multi-tenant de gestão de assinaturas, cobrança recorrente e automação de cobrança por WhatsApp/e-mail para PMEs brasileiras (100–2.000 assinantes). Três pilares, nesta ordem: régua de cobrança automática, conciliação automática de pagamento, visibilidade de receita/margem.

**BYO credentials** (ADR-009): o tenant usa a conta *dele* nos gateways e canais. Não intermediamos dinheiro nem mensagem.

---

## Arquitetura — o que exige ler vários docs para entender

### `api` e `worker` são o mesmo codebase NestJS

Dois entrypoints (`apps/api/src/main.ts` HTTP, `apps/api/src/worker.ts` jobs), um deployable cada. A razão: a regra de negócio que a automação executa é *literalmente a mesma* que a UI executa. **Nunca duplicar cálculo financeiro entre os dois.**

### `packages/core` é puro

Não importa Prisma, NestJS nem HTTP. Cálculo de multa, juros, proração, próximo vencimento, alocação de pagamento, máquina de estados de assinatura e avaliação de condições da régua vivem aqui, como funções puras testáveis em milissegundos. Se uma regra financeira precisa de I/O para ser testada, está no lugar errado.

### Contrato antes de implementação

`packages/contracts` (ts-rest + Zod) é a fonte única. Backend implementa, frontend consome, TypeScript reclama se divergirem. Sem codegen. Rotas HTTP reais — guards, interceptors e decorators do NestJS funcionam normalmente (essa foi a razão de escolher ts-rest sobre tRPC, ADR-005).

Webhooks recebidos ficam **fora** do contrato ts-rest (payload é de terceiro), em controllers `@Public()` dedicados.

### Isolamento de tenant é em duas camadas

1. **Prisma extension** (`packages/db/src/tenant-client.ts`) injeta `tenantId` em toda operação — caminho normal.
2. **RLS no Postgres** — rede de segurança para SQL cru, TypedSQL e scripts. `FORCE ROW LEVEL SECURITY` obrigatório; a aplicação conecta com role **sem `BYPASSRLS`**; migrations usam role separado.

`set_config('app.tenant_id', ..., true)` é **local à transação** — obrigatório com pooler em modo transaction.

O contexto vem do JWT, nunca da URL (ADR-006). Um `User` pertence a N tenants via `Membership`; trocar de tenant emite novo par de tokens.

### Outbox + Graphile Worker: nenhum efeito colateral se perde

Toda mudança de estado relevante acontece **dentro de uma transação** que também grava o `OutboxEvent`. Jobs são enfileirados na mesma transação via `graphile_worker.add_job` (helper `enqueue(tx, ...)` em `packages/db/src/queue.ts`). Fila roda no próprio Postgres — sem Redis (ADR-003).

Entrega é **at-least-once**: todo handler precisa ser idempotente, e ordem não é garantida.

### O ledger é a espinha dorsal

Partidas dobradas. **Saldo é sempre derivado (`SUM`), nunca armazenado.** Não existe `UPDATE ... SET balance = balance + x` em lugar nenhum. Job diário `ledger:verify` soma débitos e créditos por transação e alerta divergência — é o detector de fumaça do sistema.

Custo (`COGS`/`AP`) entra no mesmo ledger, com `customerId`+`subscriptionId`+`supplierId` em cada lançamento — é o que garante que a visão por cliente e a agregada saiam da mesma fonte e fechem.

### Pré-pago e pós-pago no mesmo motor

`Charge`, `Payment` e `LedgerEntry` são idênticos nos dois. O que muda é o **efeito da confirmação do pagamento**: pré-pago concede `AccessPeriod` (empilhável, com constraint `EXCLUDE` contra sobreposição), pós-pago apenas quita a dívida. Não construir dois subsistemas.

---

## Regras duras (violá-las é bug, não preferência)

Blocos marcados com ⚠️ nos docs são **requisitos de segurança** — não podem ser cortados por prazo. Os que mais afetam código do dia a dia:

**Dinheiro**
- `BigInt` em centavos, sufixo `...Cents`, sempre. Nunca float, nem em variável temporária. Percentuais são `Decimal`.
- Arredondamento *round half up*, em centavos, uma única vez, no fim do cálculo. Nunca `Math.round` sobre float.
- Documento emitido é imutável. Correção é documento novo (crédito, desconto, estorno), nunca edição do original.
- Cobrança com pagamento alocado não pode ser cancelada — estornar antes, senão o ledger desbalanceia.
- Multa/juros calculam sobre o **principal**, nunca sobre o total com encargos. Recálculo é idempotente (recomputa do zero, ajusta o delta).

**Idempotência** — cada uma tem mecanismo próprio, use o certo:

| Situação | Mecanismo |
|---|---|
| Geração de cobrança | `UNIQUE(subscriptionId, competenceMonth)` |
| Passo da régua | `UNIQUE(chargeId, stepId)` em `DunningExecution` |
| Webhook recebido | `UNIQUE(providerCode, externalId)` em `WebhookEvent` |
| Escrita da API | Header `Idempotency-Key` → tabela `IdempotencyKey` (TTL 24h) |
| Job agendado | `jobKey` do Graphile Worker |

**Providers** — o sistema consulta `capabilities`. **Nunca** `if (provider === 'mercadopago')`. Se uma feature precisa de galho por provider fora do módulo de integração, o modelo de capabilities está incompleto.

**Permissões** — sempre `@RequirePermission('recurso:acao')`. **Nunca** `if (user.role === 'ADMIN')` espalhado pelo código. Papel é preset de permissões; a checagem é sobre a permissão.

**Régua — travas T1–T8** (`docs/09-regua-de-cobranca.md`). São o que separa "sistema útil" de "número de WhatsApp banido no primeiro dia". As mais estruturais: régua entra em modo `REVIEW` automático após qualquer importação (T1); opt-out é global por customer em todos os canais (T5); quiet hours 08:00–20:00 no fuso do tenant (T6); um customer recebe no máximo uma mensagem de cobrança por dia, consolidada (T7); kill switch com efeito imediato (T8).

**Fuso** — datas em UTC no banco, mas vencimento e cortes de relatório são conceitos **locais do tenant**. Relatório "de julho" que inclui 31/07 21h UTC é bug de confiança. Vencimento é sempre `23:59:59` local. Âncora de fim de mês é preservada (dia 31 vira 28 em fevereiro e volta a 31 depois — nunca sobrescrever a âncora).

**Segurança**
- `$queryRawUnsafe` proibido. Só TypedSQL ou `$queryRaw` parametrizado.
- Webhook: verificar assinatura **antes** de qualquer processamento; responder 200 em < 1s (processamento pesado vai para a fila); rejeitar timestamp > 5 min; nunca confiar em valor do payload sem conferir contra o estado local.
- 404 para "não existe" **e** para "pertence a outro tenant" — nunca revelar a diferença.
- Credencial de integração nunca volta para o front, nem em log/Sentry/erro. Envelope encryption (DEK por tenant, KEK em KMS/env).
- Campo personalizado tipo `SECRET`: mascarado, permissão dedicada para revelar, todo acesso auditado, fora de export/log/mensagem.
- CSV export: escapar célula iniciada por `=`, `+`, `-`, `@`.
- LGPD: direito de eliminação é **anonimização de verdade**, não `deletedAt`. Registros financeiros preservados.

**Suite de isolamento entre tenants** — para cada endpoint autenticado, dois tenants, verificar que A não lê/escreve/deleta recurso de B. Falha aqui bloqueia deploy.

---

## Convenções de nomenclatura

| Contexto | Convenção | Exemplo |
|---|---|---|
| Eventos | `entidade.acao` no passado | `charge.paid`, `subscription.suspended` |
| Jobs | `dominio:acao` | `dunning:evaluate`, `message:send` |
| Permissões | `recurso:acao` | `charges:write` |
| Tabelas | `snake_case` plural | `ledger_entries` |
| Modelos Prisma | `PascalCase` singular | `LedgerEntry` |
| Rotas | plural, kebab-case, máx. 2 níveis | `/customers/:id/subscriptions` |
| Dinheiro | sufixo `Cents`, tipo `BigInt` | `amountCents` |
| Datas | sufixo `At`, UTC | `dueAt`, `paidAt` |
| IDs | `uuid` v7 | — |

O glossário (`docs/02-glossario.md`) é linguagem ubíqua: vale em código, banco, API e conversa. Conceito com outro nome em qualquer lugar é bug de nomenclatura. Em particular: **`Customer` é o assinante final** (cliente do nosso cliente) — nunca chamar de "usuário"; `User` é quem acessa o painel. `Plan` é o pacote comercial do tenant, não o plano do nosso SaaS.

---

## Onde procurar o quê

`docs/README.md` tem o índice completo. Atalhos para as decisões que mais mordem:

- Schema Prisma completo + **SQL manual que as migrations precisam ter** (RLS, `EXCLUDE`, índices parciais, particionamento) → `05-modelo-de-dados.md`
- Transações canônicas do ledger, alocação FIFO de pagamento, cálculo de multa/juros, conciliação → `07-financeiro-ledger.md`
- Catálogo de eventos, handlers do MVP, crontab dos jobs, rate limiting sem Redis → `08-eventos-e-jobs.md`
- Máquina de estados de `Subscription`, cálculo de vencimento, proração, trial, cancelamento → `06-assinaturas-ciclo-de-vida.md`
- Formato de erro, paginação por cursor, idempotência, rate limit, webhooks → `14-api-contratos.md`
- Pipeline de importação de planilha em 9 fases e suas armadilhas → `13-importacao-planilha.md`
- Custo, margem, `Supplier`, campos personalizados `SECRET` → `17-custos-margem-e-fornecedores.md`
- Ordem de construção e critérios de pronto por fase → `16-roadmap-mvp.md`

Marcadores nos docs: ⚠️ = requisito de segurança, não cortável. 🔮 = fora do MVP, registrado para não perder o raciocínio — **não implementar sem pedido explícito**.

---

## Prioridades ao escrever código aqui

O doc 16 fecha assim, e vale como regra de decisão: *"nenhum cliente vai escolher ou abandonar este produto por causa da ORM, do framework de front ou da camada de transporte. O que decide o resultado é: a conciliação funcionar, a régua não mandar cobrança duplicada, e o saldo bater."*

Na dúvida sobre onde gastar esforço ou rigor: financeiro > régua > importação > resto.
