# 04 — Dinheiro, lucro e margem

> Cálculo puro em `src/core/money.ts`. Queries de relatório em `src/features/reports/queries.ts`.
> **TDD obrigatório** em tudo que está em `core/`.

## As regras que não se negociam

1. **`BigInt` em centavos, sempre.** Sufixo `...Cents`. Nunca `number`, nunca `float`, **nem em variável temporária**. Um `Number(cents)` no meio de um cálculo é o bug que aparece seis meses depois numa fatura errada.
2. **Percentual é `Decimal`**, não `number`. `Decimal(5,2)` no banco, `decimal.js` na aplicação.
3. **Arredondamento *round half up*, em centavos, uma única vez, no fim.** Não arredonda em passo intermediário.
4. **Nenhuma coluna de saldo.** Total pago é `SUM(payments)`. Receita é `SUM` sobre `charges`. Se aparecer `UPDATE ... SET saldo = saldo + x`, está errado.
5. **`Charge.costCents` é congelado na emissão.** Nunca recalculado, nem quando o custo do fornecedor muda.

## Primitivas

```ts
/** Divisão com arredondamento half up. Numerador e denominador não-negativos. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const q = numerator / denominator;
  const r = numerator % denominator;
  return r * 2n >= denominator ? q + 1n : q;
}

/** Aplica um percentual sobre um valor em centavos. */
export function applyPercent(cents: bigint, percent: Decimal): bigint {
  const basisPoints = BigInt(percent.times(100).toFixed(0));   // 33.33% → 3333n
  return divRoundHalfUp(cents * basisPoints, 10_000n);
}

/** Margem em pontos percentuais, para exibição. Retorna null se não há receita. */
export function marginPercent(revenueCents: bigint, costCents: bigint): Decimal | null {
  if (revenueCents === 0n) return null;
  return new Decimal((revenueCents - costCents).toString())
    .div(revenueCents.toString())
    .times(100);
}
```

⚠️ `divRoundHalfUp` assume operandos não-negativos. Valor negativo em cobrança ou pagamento é bloqueado por `CHECK` no banco. Se um dia entrar estorno, a função precisa de tratamento de sinal explícito — e de teste próprio.

## Fronteira de serialização

`BigInt` não atravessa para componente cliente. A conversão acontece na borda do servidor:

```ts
// features/charges/queries.ts — retorna DTO, não modelo Prisma
export async function listOpenCharges() {
  const rows = await db.charge.findMany({ ... });
  return rows.map((c) => ({
    id: c.id,
    customerName: c.customer.name,
    amountCents: (c.principalCents - c.discountCents).toString(),   // string
    dueAt: c.dueAt.toISOString(),
    status: c.status,
  }));
}
```

- ❌ Devolver modelo Prisma direto de um Server Component para um client component.
- ❌ `Number(cents)` em qualquer lugar do caminho.
- ✅ Formatação para exibição usa `formatCents(value: string | bigint): string` em `lib/format.ts`, com `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

---

## Fórmula do lucro

```
receita  = Σ (principal_cents − discount_cents)
custo    = Σ cost_cents
lucro    = receita − custo
margem   = lucro ÷ receita
```

Duas leituras diferentes de "receita", e a UI precisa nomear qual está mostrando:

| Termo | Definição | Onde usar |
|---|---|---|
| **Faturado** | Cobranças emitidas no período, independentemente de pagamento | Lucro e margem — casa a receita com o custo na mesma competência |
| **Recebido** | Pagamentos com `paidAt` no período | Fluxo de caixa |

⚠️ Rotular na UI como **"lucro bruto"** enquanto não houver módulo de despesas fixas (hospedagem, chip, contador). Chamar de "lucro" o que é margem bruta é pior do que não mostrar.

⚠️ O custo é reconhecido **na emissão**, não no pagamento. Cliente inadimplente aparece como prejuízo — que é a realidade: o crédito foi comprado e não foi pago.

---

## Painel por cliente

`since` já vem de `subscriptions` em outro ponto da página, e `discount_cents` não aparece no painel — por isso não entram nesta query.

```sql
-- src/features/reports/sql/customer-pnl.sql
-- Faturado, custo e contagem por status, excluindo cobrança cancelada.
SELECT
  COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
  COUNT(*)::int                                               AS "chargesCount",
  COUNT(*) FILTER (WHERE status = 'PAID')::int                AS "paidCount",
  COUNT(*) FILTER (WHERE status = 'OVERDUE')::int              AS "overdueCount",
  COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_PAID'))::int AS "openCount"
FROM charges
WHERE "customerId" = $1
  AND status <> 'CANCELLED';

-- Recebido: soma de pagamentos de todas as cobranças do cliente (join, não coluna em charges).
-- Sem filtro de status: cobrança com pagamento registrado nunca é cancelada (regra dura do domínio),
-- então incluir CANCELLED aqui não muda o resultado — mas deixamos explícito pra não parecer omissão.
SELECT COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents"
FROM payments p
JOIN charges ch ON ch.id = p."chargeId"
WHERE ch."customerId" = $1;
```

Rende o painel do topo da ficha:

```
João Silva · cliente desde 03/2021 · Fornecedor: Tubarão

  Faturado             R$ 2.640,00
  Recebido             R$ 2.580,00
  Custo                R$   680,00
  Lucro bruto          R$ 1.960,00      margem 74%
  Renovações                    44
  Histórico                      2 atrasos · 1 em aberto
```

Emocionalmente forte e barato de implementar. É o que faz o operador não querer voltar para a planilha.

---

## Painel do mês

```sql
-- src/features/reports/sql/monthly-summary.sql
-- $1 = início do mês em UTC, $2 = início do mês seguinte em UTC
SELECT
  COALESCE(SUM(principal_cents - discount_cents), 0)                            AS billed_cents,
  COALESCE(SUM(cost_cents), 0)                                                  AS cost_cents,
  COALESCE(SUM(principal_cents - discount_cents)
           FILTER (WHERE status IN ('OPEN','OVERDUE','PARTIALLY_PAID')), 0)     AS open_cents,
  COALESCE(SUM(cost_cents)
           FILTER (WHERE status IN ('OPEN','OVERDUE','PARTIALLY_PAID')), 0)     AS cost_at_risk_cents
FROM charges
WHERE due_at >= $1 AND due_at < $2
  AND status <> 'CANCELLED';
```

```
Agosto/2026

  Faturamento       R$ 13.500,00
  Custo             R$  4.900,00
  Lucro bruto       R$  8.600,00      margem 64%

  Recebido          R$ 11.880,00
  Em aberto         R$  1.620,00   ⚠ margem em risco: R$ 590,00
```

**Margem em risco** = custo já reconhecido de cobranças ainda não recebidas. É o crédito que ele pagou ao fornecedor e não recebeu do cliente. Praticamente nenhum concorrente mostra, e é o número que mais importa para quem paga antes de receber.

⚠️ Os limites `$1` e `$2` vêm de `monthBoundsUtc(...)` — ver [`03-datas-e-ciclos.md`](./03-datas-e-ciclos.md). Nunca `date_trunc('month', due_at)` direto, que trunca em UTC e joga o dia 31 para o mês errado.

### Quebras

Mesma query, `GROUP BY` diferente:

| Por | Coluna | Uso |
|---|---|---|
| Fornecedor | `supplier_id` | "Tubarão dá 60% de margem, Club TV 40%" — decide onde concentrar |
| Plano | via `subscription.plan_id` | Identifica plano vendido abaixo do custo |
| Mês | 12 meses | Tendência de **margem**, não só de receita |
| Cliente | top e bottom 20 | Quem sustenta e quem drena |

---

## Alertas

Baratos, porque o dado já está lá. É onde o sistema ganha da planilha.

| Alerta | Regra |
|---|---|
| **Margem negativa** | `priceCents − costCents ≤ 0` na assinatura ativa |
| **Margem abaixo do limite** | Margem da assinatura < `Settings.marginAlertPercent` (padrão 30%) |
| **Custo do fornecedor subiu** | Ao editar `Supplier.unitCostCents`, mostrar quantas assinaturas caem abaixo do limite e oferecer reajuste em lote |
| **Cliente bom em atraso** | Faturado acumulado acima da média + cobrança `OVERDUE` |

⚠️ O reajuste em lote altera `Subscription.priceCents` e **não toca em cobrança já emitida**. Documento emitido é imutável.

---

## Performance

Na escala do projeto (até 1.000 assinantes, ~1.000 cobranças/mês, ~12.000/ano) nenhuma dessas queries precisa de otimização. O que precisa de disciplina:

- **N+1 não passa.** `await` de query dentro de `for`/`map` é o padrão a caçar. Resolver com `in`, `include` ou agregação.
- Lista de cobranças e mensagens usa os índices declarados em [`02-modelo-de-dados.md`](./02-modelo-de-dados.md). `EXPLAIN` conferido antes de mesclar qualquer query de lista nova.
- Paginação por cursor nas listas de cobrança e mensagem. `skip` grande degrada e pula linha quando o dado muda durante a navegação.

---

## Casos de teste obrigatórios

- [ ] `divRoundHalfUp(5n, 2n)` → `3n` (half up, não banker's rounding)
- [ ] `divRoundHalfUp(4n, 2n)` → `2n`
- [ ] `applyPercent(10_000n, 33.33)` → `3333n`
- [ ] `applyPercent(10_000n, 33.335)` — percentual com mais casas que o schema permite → erro explícito, não silêncio
- [ ] R$ 100,00 dividido em 3 partes iguais soma exatamente R$ 100,00 (nenhum centavo some nem aparece)
- [ ] Cobrança de `0n` centavos não quebra `marginPercent` — devolve `null`, não divisão por zero
- [ ] Cobrança de `1n` centavo com desconto de 50% → `1n` de desconto (half up), principal líquido `0n`
- [ ] `formatCents('123456')` → `"R$ 1.234,56"`
- [ ] Nenhuma função de `core/money.ts` aceita ou devolve `number` para valor monetário — verificado por tipo, não por convenção
- [ ] Soma de `billed_cents` de todos os clientes é igual ao `billed_cents` do painel geral do mesmo período
