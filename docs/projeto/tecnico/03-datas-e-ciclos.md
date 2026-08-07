# 03 — Datas, ciclos e vencimento

> Vive em `src/core/dates.ts` e `src/core/billing-cycle.ts`. Puro, sem I/O, sem `new Date()` interno.
> **TDD obrigatório.** É a fonte histórica de bug nº 1 deste domínio.
> Confirmado com o dono do produto em 2026-08-06 — spec de origem em `docs/superpowers/specs/2026-08-06-vencimento-por-pagamento-design.md`.

## Princípios

1. **Banco em UTC. Conceito em local.** Vencimento, corte de relatório e "hoje" são conceitos no fuso do negócio (`Settings.timezone`, padrão `America/Sao_Paulo`). O banco guarda UTC; a conversão acontece na borda.
2. **Vencimento é `23:59:59.999` local.** Cobrança que vence dia 10 está em dia até o fim do dia 10 no fuso do cliente.
3. **Vencimento do próximo ciclo é sempre derivado da data em que o pagamento do ciclo atual foi quitado.** Não existe dia fixo gravado na assinatura — o "dia" usado no cálculo é o dia do pagamento, e ele muda o ciclo inteiro pra frente quando o cliente atrasa.
4. **`new Date()` não existe dentro de `core/`.** O instante atual entra por parâmetro. Sem isso, o teste passa hoje e quebra dia 31.

Biblioteca: `date-fns` v4 + `@date-fns/tz`. Nada de aritmética manual sobre milissegundos.

---

## Vencimento por data de pagamento

O modelo é: **vencimento(ciclo N+1) = dataPagamentoTotal(ciclo N) + duração(cycle)**, mesmo dia do mês de N meses à frente.

Cliente que paga em dia todo mês vence sempre no mesmo dia — na prática se comporta como uma âncora fixa. Cliente que atrasa "anda" o ciclo inteiro pra frente: pagou o ciclo de janeiro só em 05/02, o ciclo de fevereiro vence 05/03, não no dia em que venceria se ele tivesse pagado em dia.

```
Assinatura criada 01/01, mensal.

Cobrança 1   dueAt 01/02   paga em dia, 01/02        → cobrança 2 dueAt 01/03
Cobrança 2   dueAt 01/03   paga atrasada, 05/03      → cobrança 3 dueAt 05/04
Cobrança 3   dueAt 05/04   paga em dia, 05/04        → cobrança 4 dueAt 05/05
```

**Pagamento parcial não move nada.** Só pagamento que quita o valor total da cobrança (`Charge.status` resolve para `PAID`) dispara o cálculo da próxima. Enquanto a cobrança estiver `PARTIALLY_PAID`, não existe cobrança seguinte.

**Primeira cobrança** (sem pagamento anterior): `dueAt = startedAt + duração(cycle)`, mesma lógica de clamp de fim de mês abaixo.

⚠️ Isso substitui o modelo anterior de âncora fixa por assinatura (`dueDayAnchor`). Se algum código, doc ou mock ainda referenciar esse campo, é resíduo do design anterior — corrigir, não seguir.

---

## Clamp de fim de mês

O problema: cliente pagou dia 31. Fevereiro não tem 31.

A resposta errada, e comum, é gravar 28 como se fosse o novo "dia de vencimento" permanente. Aí o cliente que pagasse em março de novo dia 31 veria o sistema vencer dia 28 pra sempre.

A resposta certa é **usar o dia do pagamento a cada ciclo e aplicar o clamp de novo, do zero, a cada cálculo**:

```ts
/** Dia efetivo do vencimento naquele mês, respeitando o dia desejado. */
export function resolveDueDay(desiredDay: number, year: number, month: number): number {
  return Math.min(desiredDay, daysInMonth(year, month));
}
```

| Dia do pagamento | Mês alvo | Dia efetivo do próximo vencimento |
|---|---|---|
| 31 | fevereiro (comum) | 28 |
| 31 | fevereiro (bissexto) | 29 |
| 31 | abril | 30 |
| 31 (pagando de novo em março, após passar por fevereiro) | março | **31** — volta |
| 30 | fevereiro | 28 |
| 29 | fevereiro (comum) | 28 |
| 15 | qualquer | 15 |

⚠️ A linha "volta a 31" só se aplica porque o **pagamento real** desse ciclo caiu de novo no dia 31 — não é um retorno automático nem uma memória do dia "desejado" original. Se o cliente tivesse pagado em março no dia 28, o próximo vencimento seria 28/04, não 31/04. Cada cálculo usa exclusivamente o dia do pagamento daquele ciclo.

O clamp nunca "gruda" — ele é recalculado do dia real do pagamento a cada ciclo, nunca a partir do resultado do clamp anterior.

---

## Ciclos

```ts
const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY:    1,
  QUARTERLY:  3,
  SEMIANNUAL: 6,
  ANNUAL:     12,
};
```

O avanço é sempre **em meses**, nunca em dias. Trimestral não é "mais 90 dias" — é "mesmo dia do pagamento, três meses à frente", com o clamp de fim de mês reaplicado.

```ts
/** Vencimento do próximo ciclo, a partir de quando o ciclo atual foi pago. */
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

/** Vencimento da primeira cobrança, sem pagamento anterior. Mesma lógica, a partir do início da assinatura. */
export function firstDueDate(params: {
  startedAt: Date;
  cycle: BillingCycle;
  timezone: string;
}): Date {
  const local = toLocal(params.startedAt, params.timezone);
  const target = addMonths(startOfMonth(local), CYCLE_MONTHS[params.cycle]);
  const day = resolveDueDay(local.getDate(), target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, params.timezone);
}

/** 23:59:59.999 local convertido para UTC. */
export function endOfLocalDay(y: number, m: number, d: number, tz: string): Date;
```

---

## Período coberto

O modelo continua **pré-pago**: o cliente paga para ter acesso no ciclo seguinte.

```
periodStart = dueAt da cobrança anterior (ou startedAt, na primeira)
periodEnd   = dia anterior ao dueAt da cobrança que está sendo criada agora
```

Cliente que pagou a cobrança de janeiro (`dueAt` 01/02) em dia:

```
Cobrança de fevereiro   dueAt 01/02 23:59:59   período 01/02 → 28/02 (dueAt da próxima é 01/03)
```

Cliente que atrasa muda o período coberto do próximo ciclo também — ele é sempre `[dueAt anterior, novo dueAt)`, então um atraso "estica" o período coberto pelo próximo ciclo pra frente junto com o vencimento.

`periodStart` continua sendo a **chave de idempotência** da criação de cobrança (`@@unique([subscriptionId, periodStart])`), reforçada pelo índice único que garante no máximo uma cobrança aberta por assinatura — ver [`02-modelo-de-dados.md`](./02-modelo-de-dados.md).

---

## Emissão de cobrança — dois gatilhos, nunca job de calendário

Não existe mais job diário que "gera cobrança 10 dias antes do vencimento" — esse modelo dependia de vencimento conhecido de antemão, e aqui o vencimento do próximo ciclo só existe depois que o atual é pago.

Cobrança nasce em exatamente dois momentos, sempre dentro da transação de quem dispara:

1. **Criação da assinatura** — `Charge.dueAt = firstDueDate(startedAt, cycle, tz)`, `periodStart = startedAt`.
2. **Pagamento total registrado** — quando o pagamento quita o valor da cobrança (`Charge.status` vira `PAID`), a mesma transação cria a próxima `Charge` com `dueAt = nextDueDate(paidAt, cycle, tz)`, `periodStart = dueAt da cobrança que acabou de ser paga`.

Pagamento parcial não passa por nenhum dos dois — só atualiza `Charge.status` para `PARTIALLY_PAID`.

Cliente que nunca paga a cobrança atual **não gera cobrança nova**. Fica `OVERDUE` indefinidamente até ser quitada — é o comportamento esperado, consistente com "no máximo uma cobrança aberta por assinatura".

### Valor da cobrança

```ts
export function calcChargeAmount(sub: {
  priceCents: bigint;
  discountType: DiscountType | null;
  discountValue: Decimal | null;
  discountUntil: Date | null;
}, at: Date): { principalCents: bigint; discountCents: bigint } {
  const principalCents = sub.priceCents;

  const discountActive = sub.discountType !== null
    && (sub.discountUntil === null || at <= sub.discountUntil);

  if (!discountActive) return { principalCents, discountCents: 0n };

  const discountCents = sub.discountType === 'FIXED'
    ? toCents(sub.discountValue!)
    : roundHalfUp(principalCents, sub.discountValue!);   // percentual

  return { principalCents, discountCents: clamp(discountCents, 0n, principalCents) };
}
```

⚠️ Arredondamento *round half up*, em centavos, **uma única vez, no fim**. Nunca `Math.round` sobre `float`. Ver [`04-dinheiro-e-margem.md`](./04-dinheiro-e-margem.md).

⚠️ `costCents` da cobrança é resolvido e **congelado** na emissão:

```
Subscription.costCents   (se > 0)
   ↓
Plan.costCents           (se > 0)
   ↓
Supplier.unitCostCents
   ↓
0
```

Se o fornecedor aumentar o preço em setembro, o relatório de agosto não pode mudar. Relatório que muda retroativamente destrói a confiança no sistema inteiro.

---

## Marcação de atraso

Job diário (`charges-mark-overdue`, 03:00 local) — a única responsabilidade de calendário que sobra: cobranças `OPEN` com `dueAt < agora` viram `OVERDUE`.

A comparação é contra o instante atual em UTC, e funciona porque `dueAt` já foi gravado como fim do dia local. Cobrança que vence 10/08 no Brasil só fica atrasada às 03:00 UTC do dia 11.

---

## Cortes de relatório

"Faturamento de agosto" significa `[01/08 00:00:00 local, 01/09 00:00:00 local)`, convertido para UTC na query.

⚠️ Relatório de agosto que inclui 31/08 21:00 UTC — que é 31/08 18:00 no Brasil, mas 01/09 em UTC+3 — é bug de confiança. O operador confere na mão, não bate, e para de acreditar no sistema.

```ts
export function monthBoundsUtc(year: number, month: number, tz: string): { from: Date; to: Date };
```

---

## Casos de teste obrigatórios

Escritos **antes** da implementação, vermelho antes de verde.

### Clamp de fim de mês (contra `paidAt`, não mais contra um campo fixo)

- [ ] Pagou 31/01 → próximo vencimento 28/02 (comum)
- [ ] Pagou 31/01 → próximo vencimento 29/02 (bissexto, 2028)
- [ ] Pagou 31/01, ciclo trimestral → próximo vencimento 30/04
- [ ] Pagou 28/02, depois pagou de novo 28/03 → mantém dia 28 (não "sobe" sozinho pra 31)
- [ ] Pagou dia 31 em janeiro, depois pagou de novo dia 31 em março → **volta a vencer 31**
- [ ] Pagou dia 1 e dia 15 → nunca mudam, qualquer mês

### Ciclos

- [ ] Mensal: pagou 31/01 → vence 28/02; pagou 28/02 → vence 28/03 (não 31/03 — usa o dia do pagamento real, não "lembra" do 31)
- [ ] Trimestral: pagou 31/01 → vence 30/04; pagou 30/04 → vence 30/07 (não 31/07 — o pagamento real caiu em 30, não em 31)
- [ ] Semestral: pagou 31/08 → vence 28/02; pagou 28/02 → vence 28/08 (não 31/08 — mesma regra: só o dia do pagamento daquele ciclo importa)
- [ ] Anual: pagou 29/02/2028 → vence 28/02/2029
- [ ] Anual atravessando virada de ano: pagou 15/12/2026 → vence 15/12/2027

### Fuso

- [ ] `dueAt` calculado a partir de pagamento em 10/08 em `America/Sao_Paulo` grava `2026-08-11T02:59:59.999Z` pro mês seguinte
- [ ] Cobrança que vence 10/08 não está `OVERDUE` às 23:00 local do dia 10
- [ ] Cobrança que vence 10/08 está `OVERDUE` às 00:01 local do dia 11
- [ ] `monthBoundsUtc` de agosto não inclui pagamento de 31/07 22:00 local
- [ ] `monthBoundsUtc` de agosto inclui pagamento de 31/08 22:00 local

### Encadeamento por pagamento e idempotência

- [ ] Assinatura criada 01/01, mensal, sem pagamento ainda → primeira cobrança vence 01/02
- [ ] Pagamento total registrado → cria a próxima cobrança com `dueAt = nextDueDate(paidAt, ...)`
- [ ] Pagamento parcial → **não** cria cobrança nova; `Charge` permanece `PARTIALLY_PAID`
- [ ] Segundo pagamento que completa o saldo da mesma cobrança gera a próxima, usando o `paidAt` do pagamento que completou
- [ ] `registerPayment` chamado duas vezes pro mesmo pagamento (dupla submissão) não cria duas cobranças seguintes
- [ ] Índice único `subscriptions_single_open_charge` rejeita uma segunda `Charge` `OPEN`/`OVERDUE`/`PARTIALLY_PAID` pra mesma assinatura
- [ ] Assinatura nunca paga permanece com uma única `Charge` `OVERDUE`, nenhuma cobrança nova é criada
- [ ] Assinatura `SUSPENDED` não gera cobrança nova mesmo que o gatilho de criação seja disparado

### Valores

- [ ] Desconto percentual de 33,33% sobre R$ 100,00 → R$ 33,33 de desconto
- [ ] Desconto fixo maior que o principal → desconto limitado ao principal, nunca negativo
- [ ] Desconto com `discountUntil` no passado → não aplica
- [ ] `discountUntil` nulo → aplica sempre
- [ ] Cobrança de R$ 0,01 e de R$ 0,00 não quebram
