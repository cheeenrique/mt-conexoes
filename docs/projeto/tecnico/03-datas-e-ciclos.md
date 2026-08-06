# 03 — Datas, ciclos e vencimento

> Vive em `src/core/dates.ts` e `src/core/billing-cycle.ts`. Puro, sem I/O, sem `new Date()` interno.
> **TDD obrigatório.** É a fonte histórica de bug nº 1 deste domínio.

## Princípios

1. **Banco em UTC. Conceito em local.** Vencimento, corte de relatório e "hoje" são conceitos no fuso do negócio (`Settings.timezone`, padrão `America/Sao_Paulo`). O banco guarda UTC; a conversão acontece na borda.
2. **Vencimento é `23:59:59.999` local.** Cobrança que vence dia 10 está em dia até o fim do dia 10 no fuso do cliente.
3. **A âncora nunca é sobrescrita.** `dueDayAnchor = 31` continua 31 depois de passar por fevereiro.
4. **`new Date()` não existe dentro de `core/`.** O instante atual entra por parâmetro. Sem isso, o teste passa hoje e quebra dia 31.

Biblioteca: `date-fns` v4 + `@date-fns/tz`. Nada de aritmética manual sobre milissegundos.

---

## Âncora de fim de mês

O problema: cliente com vencimento dia 31. Fevereiro não tem 31.

A resposta errada, e comum, é gravar 28 de volta na assinatura. Aí o cliente passa a vencer dia 28 para sempre, e ninguém percebe até ele reclamar meses depois.

A resposta certa é **guardar a âncora e derivar o dia efetivo a cada ciclo**:

```ts
/** Dia efetivo do vencimento naquele mês, respeitando a âncora. */
export function resolveDueDay(anchor: number, year: number, month: number): number {
  return Math.min(anchor, daysInMonth(year, month));
}
```

| Âncora | Mês | Dia efetivo |
|---|---|---|
| 31 | janeiro | 31 |
| 31 | fevereiro (comum) | 28 |
| 31 | fevereiro (bissexto) | 29 |
| 31 | abril | 30 |
| 31 | março | **31** — voltou |
| 30 | fevereiro | 28 |
| 29 | fevereiro (comum) | 28 |
| 15 | qualquer | 15 |

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

O avanço é sempre **em meses**, nunca em dias. Trimestral não é "mais 90 dias" — é "mesmo dia, três meses à frente", com a âncora reaplicada.

```ts
export function nextDueDate(params: {
  currentDue: Date;      // vencimento atual, em UTC
  anchor: number;        // 1..31
  cycle: BillingCycle;
  timezone: string;
}): Date {
  const local = toLocal(params.currentDue, params.timezone);
  const target = addMonths(startOfMonth(local), CYCLE_MONTHS[params.cycle]);
  const day = resolveDueDay(params.anchor, target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, params.timezone);
}

/** 23:59:59.999 local convertido para UTC. */
export function endOfLocalDay(y: number, m: number, d: number, tz: string): Date;
```

---

## Período coberto

O modelo é **pré-pago**: o cliente paga para ter acesso no ciclo seguinte.

```
periodStart = data local do vencimento desta cobrança
periodEnd   = dia anterior ao próximo vencimento
```

Cliente com âncora 10, mensal:

```
Cobrança de agosto   dueAt 10/08 23:59:59   período 10/08 → 09/09
Cobrança de setembro dueAt 10/09 23:59:59   período 10/09 → 09/10
```

`periodStart` é a **chave de idempotência** da geração (`@@unique([subscriptionId, periodStart])`). O job rodando cinco vezes no mesmo dia gera uma cobrança.

---

## Geração de cobrança

```ts
export const CHARGE_LEAD_DAYS = 10;
```

O job `charges-generate` roda diariamente e emite as cobranças cujo vencimento cai nos próximos 10 dias, para assinaturas `ACTIVE`.

Dez dias porque o primeiro passo da régua padrão é D-5 e ele precisa de uma cobrança existente para se ancorar. Gerar com muita antecedência polui a lista de "em aberto" e faz o operador desconfiar do número.

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

Job diário: cobranças `OPEN` com `dueAt < agora` viram `OVERDUE`.

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

### Âncora

- [ ] Âncora 31, janeiro → 31/01
- [ ] Âncora 31, fevereiro comum → 28/02
- [ ] Âncora 31, fevereiro bissexto (2028) → 29/02
- [ ] Âncora 31, abril → 30/04
- [ ] Âncora 31, de fevereiro para março → **volta para 31/03**
- [ ] Âncora 30, fevereiro → 28/02, e de volta para 30 em março
- [ ] Âncora 29, fevereiro comum → 28/02
- [ ] Âncora 1 e âncora 15 → nunca mudam

### Ciclos

- [ ] Mensal de 31/01 → 28/02 → 31/03
- [ ] Trimestral de 31/01 → 30/04 → 31/07 → 31/10
- [ ] Semestral de 31/08 → 28/02 → 31/08
- [ ] Anual de 29/02/2028 → 28/02/2029
- [ ] Anual atravessando virada de ano: 15/12/2026 → 15/12/2027

### Fuso

- [ ] `dueAt` de 10/08 em `America/Sao_Paulo` grava `2026-08-11T02:59:59.999Z`
- [ ] Cobrança que vence 10/08 não está `OVERDUE` às 23:00 local do dia 10
- [ ] Cobrança que vence 10/08 está `OVERDUE` às 00:01 local do dia 11
- [ ] `monthBoundsUtc` de agosto não inclui pagamento de 31/07 22:00 local
- [ ] `monthBoundsUtc` de agosto inclui pagamento de 31/08 22:00 local

### Idempotência

- [ ] `charges-generate` rodando três vezes no mesmo dia gera uma cobrança por assinatura
- [ ] `charges-generate` com assinatura `SUSPENDED` não gera nada
- [ ] Assinatura criada hoje com vencimento hoje gera cobrança na primeira execução

### Valores

- [ ] Desconto percentual de 33,33% sobre R$ 100,00 → R$ 33,33 de desconto
- [ ] Desconto fixo maior que o principal → desconto limitado ao principal, nunca negativo
- [ ] Desconto com `discountUntil` no passado → não aplica
- [ ] `discountUntil` nulo → aplica sempre
- [ ] Cobrança de R$ 0,01 e de R$ 0,00 não quebram
