# Etapa 2 — Cobrança

> Segunda etapa de entrega, conforme `docs/projeto/tecnico/07-plano-de-entrega.md`. Depende de
> Etapa 1 (Cliente/Assinatura/Fornecedor/Plano, feito e mergeado). Schema de `Charge`/`Payment`
> já documentado em `docs/projeto/tecnico/02-modelo-de-dados.md` — este spec não redesenha o
> modelo, fecha as decisões de fluxo e as poucas lacunas que o doc de dados deixou em aberto.

## Escopo

- Emissão automática de `Charge` — na criação da assinatura (se `ACTIVE`) e no pagamento total.
- Registro manual de pagamento, total e parcial, sem duplicar em dupla submissão.
- Cancelamento de cobrança, bloqueado se houver pagamento.
- Job diário `charges-mark-overdue`, autenticado por token do Cloud Scheduler.
- Painel de vencimentos (dashboard) e lista de cobranças com filtro.
- Histórico de cobranças/pagamentos na ficha do cliente.

Fora do escopo: multa/juros por atraso (⚠️ documentado como fora do escopo B em `02-modelo-de-dados.md`), conciliação via webhook (`PaymentSource.WEBHOOK` existe no enum, sem uso ainda), régua de cobrança e WhatsApp (Etapa 3).

## Schema

`Charge` e `Payment` — exatamente como especificado em `02-modelo-de-dados.md`, seção "Cobrança e
pagamento", incluindo os `CHECK`s e o índice único parcial `subscriptions_single_open_charge`.
Uma adição a este spec:

```prisma
model Payment {
  // ...campos já documentados
  idempotencyKey String? @unique
}
```

`idempotencyKey` é gerada no client (um id por abertura do diálogo de registro de pagamento) e
enviada junto na Server Action. Cobre duplo clique, F5 durante o submit e duas abas abertas no
mesmo formulário — o `@unique` faz o banco recusar a segunda tentativa com a mesma key.
`nullable` porque uma entrada futura via webhook (`PaymentSource.WEBHOOK`) não passa por esse
formulário e não tem key de client; a dedupe dela já é outra (`@@unique([source, externalId])`).

**Migration desta etapa também remove um resíduo do modelo antigo:** o `CHECK` `subs_anchor_range`
sobre `subscriptions.due_day_anchor`, listado no SQL manual de `02-modelo-de-dados.md`, referencia
uma coluna que não existe mais desde o pivô para vencimento por data de pagamento (ver `CLAUDE.md`,
regras de data). Ficou esquecido no doc depois do pivô — remover do doc e não recriar na migration.

## Derivação de status — `core/billing.ts`

Uma função pura, nova, TDD-obrigatório por tocar dinheiro e data:

```ts
export type ChargeStatus = 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

/**
 * Deriva o status de uma cobrança a partir do saldo e do vencimento. Nunca
 * devolve CANCELLED — cancelamento é ação explícita, não derivada. `now`
 * entra por parâmetro, nunca `new Date()` interno.
 */
export function deriveChargeStatus(params: {
  netCents: bigint;      // principalCents - discountCents
  paidCents: bigint;     // SUM(payments.amountCents) para essa charge
  dueAt: Date;           // já em UTC, 23:59:59 local
  now: Date;
}): 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID' | 'PAID' {
  if (params.paidCents >= params.netCents) return 'PAID';
  if (params.now > params.dueAt) return 'OVERDUE';
  if (params.paidCents > 0n) return 'PARTIALLY_PAID';
  return 'OPEN';
}
```

Usada em dois lugares, nunca duplicada:

1. **Registro de pagamento** — depois de inserir o `Payment`, soma os pagamentos da `Charge` e
   roda `deriveChargeStatus`, tudo dentro da mesma transação.
2. **Job `charges-mark-overdue`** — para toda `Charge` com status em `(OPEN, OVERDUE,
   PARTIALLY_PAID)`, recomputa e persiste. Idempotente por natureza: rodar duas vezes no mesmo
   dia dá o mesmo resultado, porque a função é pura sobre o estado atual, não um "avança um
   passo".

`CANCELLED` é escrita só pela ação de cancelamento, nunca por essa função — uma `Charge`
`CANCELLED` nunca entra na consulta do job (`status <> 'CANCELLED'`).

## Emissão automática (evento na transação, nunca job)

Dois pontos de entrada, cobertos pelo índice único parcial (no máximo uma `Charge`
`OPEN`/`OVERDUE`/`PARTIALLY_PAID` por `subscriptionId` — dupla submissão ou corrida entre os dois
pontos não gera duas cobranças abertas, o banco recusa a segunda):

### 1. Criação de assinatura

Só emite se a assinatura nascer `ACTIVE` (não `SUSPENDED`/`CANCELLED` — assinatura importada como
histórico ou criada já suspensa não gera cobrança em aberto sem sentido). Dentro da mesma
transação de `createSubscription`:

```
periodStart = startedAt
periodEnd   = startedAt + cycle (mesmo cálculo de core/dates.ts, sem duplicar)
dueAt       = nextDueAt (já calculado por firstDueDate, sem mudança nesse cálculo)
principalCents = subscription.priceCents  (congelado)
costCents      = subscription.costCents   (congelado)
discountCents  = aplicação de discountType/discountValue quando discountUntil >= periodStart
```

### 2. Pagamento total registrado

Dentro da mesma transação que grava o `Payment` e atualiza a `Charge` atual para `PAID`:

```
novo nextDueAt = nextDueDate({ paidAt, cycle, timezone })   // já existe em core/dates.ts
subscription.nextDueAt = novo nextDueAt                      // update
nova Charge:
  periodStart = periodEnd da Charge anterior
  periodEnd   = novo ciclo a partir daí
  dueAt       = novo nextDueAt
  principalCents/costCents = subscription.priceCents/costCents no momento (congelado de novo)
```

Pagamento **parcial** não emite próxima cobrança — só grava o `Payment` e recomputa o status da
`Charge` atual (vira `PARTIALLY_PAID` se ainda não venceu, `OVERDUE` se já passou do vencimento
mesmo com pagamento parcial — ver `deriveChargeStatus`).

⚠️ **Editar assinatura (`updateSubscription`) não toca cobrança já emitida.** Mudar preço, custo
ou ciclo só afeta a próxima emissão. `Charge.principalCents`/`costCents` são imutáveis depois de
criados — mesma regra de `CLAUDE.md` ("documento emitido é imutável").

## Registro de pagamento

Server Action em `features/charges/actions.ts`, chamando `features/charges/service.ts`. Um único
formulário cobre total e parcial — a diferença é só se `amountCents` fecha o saldo devedor
(`netCents - paidCents`) ou não; a UI não decide isso, o service decide depois de aplicar.

Campos: valor (centavos), método (`PIX` default), data do pagamento (`paidAt`, pode ser diferente
de hoje — "quando o dinheiro entrou, não quando foi registrado", já documentado), nota opcional.

Validação de negócio (service, não Zod): `amountCents` não pode exceder o saldo devedor — pagamento
que "sobra" não é registrado como está, o operador ajusta o valor. Rejeição com `DomainError` +
`code`, mensagem pt-BR.

## Cancelamento de cobrança

Bloqueado se `SUM(payments.amountCents) > 0` para aquela `Charge` — `service` recusa, a UI nem
oferece o botão nesse caso (mesmo padrão do resto do projeto: erro checado nos dois lados, UI
esconde o que o service vai recusar). Motivo em texto livre (`cancelReason`), mesmo padrão de
`Subscription.cancelReason`. Ação destrutiva, confirmação explícita na UI.

## Job `charges-mark-overdue`

`app/api/cron/charges-mark-overdue/route.ts`, mesmo padrão de autenticação do `cron/ping`
existente (`assertCronRequest`, 401 sem corpo se o token não bater). Roda 1x/dia, cedo, no fuso do
negócio (horário exato de disparo é config do Cloud Scheduler, fora do código). Handler:

1. Busca toda `Charge` com `status IN (OPEN, OVERDUE, PARTIALLY_PAID)` e `dueAt` no passado —
   mas também recomputa as que já são `OVERDUE`/`PARTIALLY_PAID` (a função é idempotente, rodar em
   cima de uma linha que já está correta não muda nada).
2. Para cada uma, soma pagamentos, roda `deriveChargeStatus`, persiste se mudou.
3. Falha por linha é capturada e logada, não derruba a passada inteira (mesmo padrão dos outros
   jobs do projeto).
4. `now` entra por parâmetro no handler (`new Date()` uma vez, no topo do handler — não dentro de
   `core/`), desce até `deriveChargeStatus`.

Processa em lote se o volume justificar (na escala do projeto, até ~1.000 cobranças, não deveria
nem chegar perto do timeout do Cloud Run — sem otimização prematura aqui).

## Painel de vencimentos (dashboard)

Não existe hoje — `(app)/page.tsx` é novo. Quatro blocos, cada um uma query com `LIMIT` pequeno
(top N) + um total:

| Bloco | Filtro |
|---|---|
| Vencem hoje | `dueAt` dentro do dia local de hoje, `status IN (OPEN, OVERDUE, PARTIALLY_PAID)` |
| Próximos 7 dias | `dueAt` entre amanhã e +7 dias local, mesmo filtro de status |
| Em atraso | `status = OVERDUE` |
| Recebido no mês | `SUM(payments.amountCents)` com `paidAt` dentro do mês corrente (`monthBoundsUtc`, nunca `date_trunc`) |

Cada bloco linka pra lista de cobranças já filtrada.

## Lista de cobranças

`(app)/charges/page.tsx`. Filtro por status, cliente, fornecedor, período (`dueAt` ou `paidAt`,
a definir na UI qual eixo — vencimento é o mais útil pro operador, pagamento fica de fora deste
filtro por ora). Paginação por cursor, mesmo padrão do resto do projeto. Query em
`features/charges/queries.ts`, devolve DTO, nunca modelo Prisma — `BigInt` vira string na borda.

## Histórico na ficha do cliente

Seção nova em `(app)/customers/[id]`, dentro do componente de ficha já existente (da Etapa 1b) —
lista as `Charge`s de cada `Subscription` do cliente, com os `Payment`s de cada uma. Reaproveita o
mesmo DTO/query pattern da lista de cobranças, filtrado por `customerId`.

## Fora do escopo (documentar, não implementar)

- Multa e juros por atraso — colunas novas (`lateFeeCents`, `interestCents`) se entrarem depois,
  recálculo idempotente sobre o principal, nunca sobre o total com encargos (já em
  `02-modelo-de-dados.md`).
- Conciliação automática via webhook — `PaymentSource.WEBHOOK` e `@@unique([source, externalId])`
  já existem no schema, sem uso nesta etapa.
- Régua de cobrança, canais de WhatsApp, mensagens — Etapa 3.

## Critério de pronto

- Criar assinatura `ACTIVE` gera a primeira `Charge` automaticamente.
- Criar assinatura `SUSPENDED`/`CANCELLED` não gera `Charge`.
- Registrar pagamento parcial não gera próxima cobrança; total gera, com o vencimento certo
  (`nextDueDate` a partir do `paidAt` registrado).
- Registrar o mesmo pagamento duas vezes (dupla submissão, mesma `idempotencyKey`) não duplica —
  o banco recusa a segunda linha, a UI trata o erro sem quebrar.
- `deriveChargeStatus` cobre os casos: `OPEN`→`OVERDUE` (venceu sem pagamento), `OPEN`→
  `PARTIALLY_PAID` (pagamento parcial antes do vencimento), `PARTIALLY_PAID`→`OVERDUE` (venceu com
  saldo em aberto), qualquer status→`PAID` (saldo zerado), nunca deriva `CANCELLED`.
- Cancelar cobrança com pagamento registrado é recusado pelo service com `DomainError` de código
  claro; a UI não oferece a ação nesse caso.
- Job `charges-mark-overdue` rodado duas vezes seguidas no mesmo dia dá o mesmo resultado.
- Painel de vencimentos e lista de cobranças batem com uma conferência manual contra os dados de
  teste (soma de `billed_cents` do painel = soma da lista filtrada, sem duplicar nem sumir linha).
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test && pnpm test:integration` verdes.

## Auto-revisão do spec

- **Placeholder scan:** nenhum "TBD"/"a definir" solto — o único ponto de decisão adiada (filtro
  de período por `dueAt` vs `paidAt`) está marcado explicitamente com a escolha feita (`dueAt`) e
  o motivo, não deixado em aberto.
- **Consistência interna:** `deriveChargeStatus` é a única fonte de transição de status, usada nos
  dois pontos que escrevem `Charge.status` (pagamento e job) — sem lógica de status duplicada em
  outro lugar do spec.
- **Escopo:** fechado em cobrança — não toca régua/canal (Etapa 3), não toca multa/juros (fora do
  escopo B), não redesenha `Customer`/`Subscription` (Etapa 1, já feito).
- **Ambiguidade:** "editar assinatura não toca cobrança já emitida" resolve explicitamente o caso
  óbvio de ambiguidade (o que acontece com uma `Charge` `OPEN` se o operador edita o preço da
  assinatura no meio do ciclo) — não afeta, documento emitido é imutável.
