# Vencimento por data de pagamento — design

> Substitui o modelo de âncora fixa de calendário descrito em `docs/projeto/tecnico/03-datas-e-ciclos.md`.
> Confirmado com o dono do produto: 2026-08-06.

## Motivação

O modelo original assumia vencimento fixo por assinatura (`dueDayAnchor`, 1–31), preservado através dos meses independente de quando o cliente de fato pagou. Na prática do negócio, o vencimento do próximo ciclo é **sempre o mesmo dia do mês em que o cliente pagou** o ciclo atual — não um dia fixo definido na criação da assinatura.

Exemplo: assinatura criada 01/01. Cliente paga em dia, vence 01/02. Cliente atrasa e paga só em 05/02 → o próximo vencimento é 05/03, não 01/03. Todo atraso "anda" o ciclo pra frente.

## Regra

```
vencimento(ciclo N+1) = dataPagamentoTotal(ciclo N) + duração(cycle)
```

- "Duração do ciclo" segue a mesma tabela já existente (`MONTHLY` = +1 mês, `QUARTERLY` = +3, etc.), avançando em **meses**, nunca em dias corridos.
- Mesmo dia do mês seguinte, com a mesma lógica de âncora de fim de mês que já existe: pagou 31/01 → vence 28/02 (ou 29 em bissexto) → volta a vencer 31/03. A "âncora" não é mais um campo fixo da assinatura — é derivada do dia do pagamento a cada ciclo.
- **Primeira cobrança** (sem pagamento anterior): `dueAt = startedAt + duração(cycle)`, mesma lógica de clamp de fim de mês.
- **Pagamento parcial não conta.** Só pagamento que quita o valor total da cobrança (`Charge.status = PAID`) dispara o cálculo do próximo vencimento. `PARTIALLY_PAID` mantém a cobrança atual em aberto e não gera nada.

## O que sai

- `Subscription.dueDayAnchor` — não existe mais dia fixo por assinatura.
- Job `charges-generate` (cron diário que emitia cobrança 10 dias antes do vencimento) — não faz sentido nesse modelo: a próxima cobrança só existe depois que a atual é paga, não há "vencimento futuro conhecido" pra antecipar.

## O que muda

### `core/dates.ts`

`nextDueDate` muda de assinatura: recebe `paidAt` (não mais `currentDue`) + `anchor` deixa de existir como parâmetro fixo — o "dia" usado no clamp de fim de mês passa a ser `paidAt.getDate()`.

```ts
export function nextDueDate(params: {
  paidAt: Date;          // quando o pagamento total foi registrado, em UTC
  cycle: BillingCycle;
  timezone: string;
}): Date {
  const local = toLocal(params.paidAt, params.timezone);
  const target = addMonths(startOfMonth(local), CYCLE_MONTHS[params.cycle]);
  const day = resolveDueDay(local.getDate(), target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, params.timezone);
}
```

`resolveDueDay` não muda — continua puro, recebe o dia desejado e o mês alvo, devolve o dia efetivo com clamp.

Função nova pra primeira cobrança, mesma forma:

```ts
export function firstDueDate(params: {
  startedAt: Date;
  cycle: BillingCycle;
  timezone: string;
}): Date;   // mesma lógica de nextDueDate, usando startedAt no lugar de paidAt
```

### Emissão de cobrança — dois gatilhos, dentro da transação de quem dispara

1. **Criação da assinatura** (`features/subscriptions/service.ts`): cria `Subscription` e a primeira `Charge` na mesma transação. `Charge.dueAt = firstDueDate(...)`, `periodStart = startedAt`, `periodEnd = dia anterior ao dueAt`.
2. **Pagamento total** (`features/charges/service.ts::registerPayment`): quando o pagamento registrado quita o total da cobrança (`Charge.status` resolve para `PAID`), a mesma transação calcula `nextDueDate(paidAt, cycle, tz)` e cria a `Charge` seguinte. `periodStart = dueAt da cobrança que acabou de ser paga`, `periodEnd = dia anterior ao novo dueAt`.

Pagamento parcial: só atualiza `Charge.status` para `PARTIALLY_PAID`. Nenhuma cobrança nova é criada.

### Uma cobrança aberta por vez

Reforço de constraint: no máximo uma `Charge` em status `OPEN`, `OVERDUE` ou `PARTIALLY_PAID` por `subscriptionId`. Hoje a idempotência é só `@@unique([subscriptionId, periodStart])`; com emissão por evento (dois pontos de entrada possíveis: criação e pagamento) isso não basta — precisa de índice único parcial adicional:

```sql
CREATE UNIQUE INDEX subscriptions_single_open_charge
  ON charges (subscription_id)
  WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID');
```

Cliente que nunca paga a cobrança atual **não recebe cobrança nova** — ela fica `OVERDUE` indefinidamente até ser quitada. É o comportamento esperado: modelo pré-pago, sem cobranças paralelas acumulando.

### Cron

- `charges-generate` — **removido**.
- Sobra um job diário (mesmo horário, 03:00 local) só com a responsabilidade de marcar `OPEN → OVERDUE` quando `dueAt < agora`. Pode manter o nome do arquivo de rota ou renomear para `charges-mark-overdue` — decisão de implementação, sem impacto de regra.
- `dunning-evaluate` e `messages-dispatch` — sem mudança. Continuam reagindo ao `Charge.dueAt` gravado, seja ele originado por âncora ou por pagamento.

### Relatórios

Sem mudança de fórmula. `periodStart`/`periodEnd` continuam existindo por cobrança, calculados no momento da emissão (ver acima). `monthBoundsUtc` e os cortes de relatório mensal olham `dueAt`/`issuedAt`, que continuam sendo datas reais gravadas — não recalculadas.

### Régua

Sem mudança de motor. A régua já reage ao `dueAt` da cobrança atual; de onde esse valor veio (âncora fixa ou pagamento) é irrelevante pro motor de avaliação e despacho.

## Migração de dado existente

Se houver base já importada com `dueDayAnchor` preenchido antes desta mudança entrar em produção:

1. Expand: adicionar a lógica nova sem remover `dueDayAnchor` ainda.
2. Back-fill: para cada assinatura, `nextDueAt` recalculado a partir do **último pagamento total registrado** (`MAX(payments.paidAt) WHERE charge quitada`), ou `startedAt` se nunca houve pagamento.
3. Contract: remover `dueDayAnchor` numa migration posterior, depois de validar que nada mais lê o campo.

## Casos de teste (substituem/complementam a lista de `03-datas-e-ciclos.md`)

### Âncora de fim de mês (contra `paidAt`, não mais contra "vencimento atual")

- [ ] Pagou 31/01 → próximo vencimento 28/02 (comum) ou 29/02 (bissexto)
- [ ] Pagou 31/01, ciclo trimestral → próximo vencimento 30/04
- [ ] Pagou 28/02 → próximo vencimento 28/03 (não volta a subir pra 31)
- [ ] Pagou dia 15 → sempre dia 15, qualquer mês

### Encadeamento por pagamento

- [ ] Assinatura criada 01/01, mensal, sem pagamento ainda → primeira cobrança vence 01/02
- [ ] Pagou primeira cobrança em dia (01/02) → próxima vence 01/03
- [ ] Pagou primeira cobrança atrasada (05/02) → próxima vence 05/03, não 01/03
- [ ] Pagamento parcial não gera próxima cobrança — `Charge` permanece `PARTIALLY_PAID`
- [ ] Segundo pagamento que completa o saldo da mesma cobrança gera a próxima, com `paidAt` do pagamento que completou

### Idempotência

- [ ] `registerPayment` chamado duas vezes pro mesmo pagamento (dupla submissão) não cria duas cobranças seguintes — protegido pela transação + índice único de cobrança aberta
- [ ] Índice único de "uma cobrança aberta por assinatura" rejeita inserção de uma segunda `OPEN` para a mesma `subscriptionId`
- [ ] Assinatura nunca paga não gera cobrança nova — permanece uma única `Charge` `OVERDUE`

### Relatórios

- [ ] `periodStart`/`periodEnd` da cobrança gerada por pagamento batem com o intervalo real coberto (dueAt anterior → dia antes do novo dueAt)
- [ ] Corte de relatório mensal não muda de comportamento com o novo modelo — mesmos casos de `03-datas-e-ciclos.md`

## Fora de escopo desta mudança

- Multa/juros por atraso — não existe na spec (`02-modelo-de-dados.md:256`), e continua fora.
- Qualquer alteração no motor da régua ou nos adapters de canal.
- Reajuste de preço/custo por assinatura — regra de "histórico imutável" (`Charge.costCents`/`principalCents` congelados na emissão) não muda.
