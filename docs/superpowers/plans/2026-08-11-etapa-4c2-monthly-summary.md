# Etapa 4c-2 — Painel do mês, quebras e export CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela `/reports` com resumo financeiro do mês, quatro quebras (fornecedor, plano, cliente top/bottom 20, tendência de 12 meses) e export CSV das três quebras tabulares.

**Architecture:** Queries novas em `features/reports/queries.ts` (já existe desde a Etapa 4c-1), SQL versionado em `features/reports/sql/`. Página Server Component com navegação de mês via `searchParams`. Export via Route Handler (`GET`, `text/csv`), não Server Action — download de arquivo é navegação, não mutação.

**Tech Stack:** Next.js App Router, Prisma `$queryRaw`, Vitest (unit + integração), Testing Library.

## Global Constraints

- `BigInt` em centavos, nunca `number`/`float` no caminho monetário — nem em variável temporária.
- `$queryRawUnsafe` proibido. Só `$queryRaw` tagged template.
- Cobrança `CANCELLED` nunca entra em nenhuma soma/quebra.
- Limite de mês vem de `monthBoundsUtc(year, month, timezone)` — `month` é 0-indexed (convenção já usada em `charges/queries.ts`). **Nunca** `date_trunc('month', ...)`.
- Lucro e margem **não** entram em nenhum DTO — sempre calculados no componente via `core/money` (`marginPercent`), mesmo padrão da Etapa 4c-1. Evita duplicar a fórmula em query e UI.
- DTO devolve `string` pra todo campo monetário.
- Nenhum modelo Prisma devolvido direto — sempre DTO.
- CSV: célula iniciada por `=`, `+`, `-`, `@` recebe prefixo `'` (regra dura do projeto, CSV injection).
- Filtro (mês) em `searchParams`, nunca em `useState`.
- Rota da UI em inglês (convenção do projeto) — `/reports`, não `/relatorios`. O menu lateral já tem uma entrada apontando pra `/relatorios` (link morto hoje); corrigir pra `/reports` faz parte da Task 4.

---

### Task 1: `lib/csv.ts` — escape e serialização

**Files:**
- Create: `src/lib/csv.ts`
- Test: `src/lib/csv.test.ts`

**Interfaces:**
- Produces: `export function escapeCsvCell(value: string): string`, `export function toCsv(headers: string[], rows: string[][]): string` — consumidos pela Task 5.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/lib/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';

describe('escapeCsvCell', () => {
  it('prefixa célula iniciada por =', () => {
    expect(escapeCsvCell('=SOMA(A1:A2)')).toBe("'=SOMA(A1:A2)");
  });

  it('prefixa célula iniciada por +, -, @', () => {
    expect(escapeCsvCell('+55')).toBe("'+55");
    expect(escapeCsvCell('-10')).toBe("'-10");
    expect(escapeCsvCell('@user')).toBe("'@user");
  });

  it('não mexe em célula normal', () => {
    expect(escapeCsvCell('João Silva')).toBe('João Silva');
    expect(escapeCsvCell('R$ 100,00')).toBe('R$ 100,00');
  });
});

describe('toCsv', () => {
  it('gera header + linhas separadas por vírgula, terminadas em CRLF', () => {
    const csv = toCsv(['Nome', 'Valor'], [['João', '100'], ['Maria', '200']]);
    expect(csv).toBe('Nome,Valor\r\nJoão,100\r\nMaria,200');
  });

  it('envolve em aspas célula com vírgula, dobrando aspas internas', () => {
    const csv = toCsv(['Nome'], [['Silva, João "Jota"']]);
    expect(csv).toBe('Nome\r\n"Silva, João ""Jota"""');
  });

  it('aplica escapeCsvCell antes de decidir sobre aspas', () => {
    const csv = toCsv(['Fórmula'], [['=A1,B2']]);
    expect(csv).toBe('Fórmula\r\n"\'=A1,B2"');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- csv.test.ts`
Expected: FAIL — `Cannot find module './csv'`.

- [ ] **Step 3: Implementar**

Criar `src/lib/csv.ts`:

```ts
/** Escapa célula que começa com =, +, -, @ — mitigação de CSV injection (regra dura do projeto). */
export function escapeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeField(value: string): string {
  const escaped = escapeCsvCell(value);
  return /[",\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** Serializa em CSV (RFC 4180, CRLF), com escape de fórmula em toda célula. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeField).join(',')).join('\r\n');
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- csv.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/csv.test.ts
git commit -m "feat(lib): add CSV serialization with formula-injection escaping"
```

---

### Task 2: Queries de resumo do mês e quebras (fornecedor, plano)

**Files:**
- Create: `src/features/reports/sql/monthly-summary.sql`
- Create: `src/features/reports/sql/supplier-breakdown.sql`
- Create: `src/features/reports/sql/plan-breakdown.sql`
- Modify: `src/features/reports/queries.ts`
- Test: `src/features/reports/queries.integration.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface MonthlySummaryDTO { billedCents: string; costCents: string; receivedCents: string; openCents: string; costAtRiskCents: string }
  export interface BreakdownRowDTO { id: string; name: string; billedCents: string; costCents: string }
  export async function getMonthlySummary(from: Date, to: Date): Promise<MonthlySummaryDTO>
  export async function getSupplierBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]>
  export async function getPlanBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]>
  ```
  Consumidos pela Task 4 (UI) e Task 5 (export).

- [ ] **Step 1: Criar os arquivos de referência SQL**

`src/features/reports/sql/monthly-summary.sql`:

```sql
-- $1 = início do mês em UTC, $2 = início do mês seguinte em UTC (monthBoundsUtc, nunca date_trunc).
SELECT
  COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
  COALESCE(SUM("principalCents" - "discountCents")
           FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "openCents",
  COALESCE(SUM("costCents")
           FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "costAtRiskCents"
FROM charges
WHERE "dueAt" >= $1 AND "dueAt" < $2
  AND status <> 'CANCELLED';
```

`src/features/reports/sql/supplier-breakdown.sql`:

```sql
SELECT
  s.id AS "id", s.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN suppliers s ON s.id = ch."supplierId"
WHERE ch."dueAt" >= $1 AND ch."dueAt" < $2
  AND ch.status <> 'CANCELLED'
GROUP BY s.id, s.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
```

`src/features/reports/sql/plan-breakdown.sql`:

```sql
SELECT
  p.id AS "id", p.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN subscriptions sub ON sub.id = ch."subscriptionId"
JOIN plans p ON p.id = sub."planId"
WHERE ch."dueAt" >= $1 AND ch."dueAt" < $2
  AND ch.status <> 'CANCELLED'
GROUP BY p.id, p.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
```

- [ ] **Step 2: Escrever os testes de integração que falham**

Adicionar ao final de `src/features/reports/queries.integration.test.ts` (o arquivo já existe da Etapa 4c-1 — adicionar os imports novos ao topo: `getMonthlySummary, getSupplierBreakdown, getPlanBreakdown` e `monthBoundsUtc` de `@/core/dates`):

```ts
import { monthBoundsUtc } from '@/core/dates';
import { getMonthlySummary, getSupplierBreakdown, getPlanBreakdown } from './queries';

const TZ = 'America/Sao_Paulo';

async function seedMonthlyFixture() {
  const supplierA = await db.supplier.create({ data: { name: 'Fornecedor Mês A', unitCostCents: 1000n } });
  const supplierB = await db.supplier.create({ data: { name: 'Fornecedor Mês B', unitCostCents: 1000n } });
  const planA = await db.plan.create({ data: { name: 'Plano Mês A', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const customer = await db.customer.create({ data: { name: 'Mês Teste', phone: '+5511998880888' } });
  const subA = await db.subscription.create({
    data: { customerId: customer.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
  });
  const subB = await db.subscription.create({
    data: { customerId: customer.id, planId: planA.id, supplierId: supplierB.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') },
  });
  return { supplierA, supplierB, planA, customer, subA, subB };
}

afterEach(async () => {
  await db.charge.deleteMany({ where: { customer: { name: 'Mês Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Mês Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Mês Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Mês A' } });
  await db.supplier.deleteMany({ where: { name: { startsWith: 'Fornecedor Mês' } } });
});

describe('getMonthlySummary', () => {
  it('soma billedCents/costCents dentro do mês, exclui CANCELLED e outros meses', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto (0-indexed)
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-01'), dueAt: new Date('2026-09-15T23:59:59-03:00'), status: 'OPEN' } });
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-20T23:59:59-03:00'), status: 'CANCELLED' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('6000');
    expect(result.costCents).toBe('1000');
  });

  it('openCents/costAtRiskCents somam só status não-terminal, PAID entra em billedCents mas não nesses dois', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 4000n, costCents: 500n, periodStart: new Date('2026-08-02'), periodEnd: new Date('2026-08-02'), dueAt: new Date('2026-08-16T23:59:59-03:00'), status: 'OVERDUE' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('10000');
    expect(result.openCents).toBe('4000');
    expect(result.costAtRiskCents).toBe('500');
  });

  it('limite de mês respeita fuso local — cobrança 23h59 do último dia do mês em SP entra no mês certo', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ); // agosto
    // 31/08 23:59:59 em America/Sao_Paulo (UTC-3) é 01/09 02:59:59 em UTC — se o código usasse
    // date_trunc em UTC, isso cairia em setembro por engano.
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-31'), periodEnd: new Date('2026-08-31'), dueAt: new Date('2026-08-31T23:59:59-03:00'), status: 'OPEN' } });

    const result = await getMonthlySummary(from, to);

    expect(result.billedCents).toBe('6000');
  });
});

describe('getSupplierBreakdown', () => {
  it('agrupa por fornecedor, exclui fornecedor sem cobrança no mês', async () => {
    const { customer, supplierA, supplierB, subA, subB } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });
    // subB não recebe cobrança nenhuma — não deve aparecer na quebra.
    void subB;

    const rows = await getSupplierBreakdown(from, to);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(supplierA.id);
    expect(rows[0].billedCents).toBe('6000');
    expect(rows.find((r) => r.id === supplierB.id)).toBeUndefined();
  });
});

describe('getPlanBreakdown', () => {
  it('agrupa por plano via subscription', async () => {
    const { customer, supplierA, planA, subA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'PAID' } });

    const rows = await getPlanBreakdown(from, to);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(planA.id);
    expect(rows[0].billedCents).toBe('6000');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: FAIL — `getMonthlySummary`/`getSupplierBreakdown`/`getPlanBreakdown` não existem.

- [ ] **Step 4: Implementar**

Adicionar ao final de `src/features/reports/queries.ts` (mantém `getCustomerPnl` e `CustomerPnlDTO` como estão):

```ts
export interface MonthlySummaryDTO {
  billedCents: string;
  costCents: string;
  receivedCents: string;
  openCents: string;
  costAtRiskCents: string;
}

export interface BreakdownRowDTO {
  id: string;
  name: string;
  billedCents: string;
  costCents: string;
}

type SummaryRow = { billedCents: string; costCents: string; openCents: string; costAtRiskCents: string };

export async function getMonthlySummary(from: Date, to: Date): Promise<MonthlySummaryDTO> {
  const [summaryRows, receivedAgg] = await Promise.all([
    db.$queryRaw<SummaryRow[]>`
      SELECT
        COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
        COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
        COALESCE(SUM("principalCents" - "discountCents")
                 FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "openCents",
        COALESCE(SUM("costCents")
                 FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "costAtRiskCents"
      FROM charges
      WHERE "dueAt" >= ${from} AND "dueAt" < ${to}
        AND status <> 'CANCELLED'
    `,
    db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } }),
  ]);

  const s = summaryRows[0];
  return {
    billedCents: s.billedCents,
    costCents: s.costCents,
    openCents: s.openCents,
    costAtRiskCents: s.costAtRiskCents,
    receivedCents: (receivedAgg._sum.amountCents ?? 0n).toString(),
  };
}

export async function getSupplierBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]> {
  return db.$queryRaw<BreakdownRowDTO[]>`
    SELECT
      s.id AS "id", s.name AS "name",
      COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
      COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
    FROM charges ch
    JOIN suppliers s ON s.id = ch."supplierId"
    WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
      AND ch.status <> 'CANCELLED'
    GROUP BY s.id, s.name
    ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC
  `;
}

export async function getPlanBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]> {
  return db.$queryRaw<BreakdownRowDTO[]>`
    SELECT
      p.id AS "id", p.name AS "name",
      COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
      COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
    FROM charges ch
    JOIN subscriptions sub ON sub.id = ch."subscriptionId"
    JOIN plans p ON p.id = sub."planId"
    WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
      AND ch.status <> 'CANCELLED'
    GROUP BY p.id, p.name
    ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC
  `;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: PASS, todos os testes (os 6 de `getCustomerPnl` da 4c-1 + os novos).

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/
git commit -m "feat(reports): add monthly summary, supplier and plan breakdown queries"
```

---

### Task 3: Quebra por cliente (top/bottom 20) e tendência de 12 meses

**Files:**
- Create: `src/features/reports/sql/customer-breakdown.sql`
- Modify: `src/features/reports/queries.ts`
- Test: `src/features/reports/queries.integration.test.ts`

**Interfaces:**
- Consumes: `monthBoundsUtc` de `@/core/dates` (já existe).
- Produces:
  ```ts
  export interface CustomerBreakdownDTO { top: BreakdownRowDTO[]; bottom: BreakdownRowDTO[] }
  export interface MonthlyTrendRowDTO { year: number; month: number; label: string; billedCents: string; costCents: string }
  export async function getCustomerBreakdown(from: Date, to: Date): Promise<CustomerBreakdownDTO>
  export async function getMonthlyTrend(year: number, month: number, timezone: string): Promise<MonthlyTrendRowDTO[]>
  ```
  `month` em `getMonthlyTrend` é 0-indexed (mesma convenção de `monthBoundsUtc`). Devolve 12 linhas, do mês `(year, month - 11)` até `(year, month)`, em ordem cronológica crescente.

- [ ] **Step 1: Criar o arquivo de referência SQL**

`src/features/reports/sql/customer-breakdown.sql`:

```sql
SELECT
  c.id AS "id", c.name AS "name",
  COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
  COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
FROM charges ch
JOIN customers c ON c.id = ch."customerId"
WHERE ch."dueAt" >= $1 AND ch."dueAt" < $2
  AND ch.status <> 'CANCELLED'
GROUP BY c.id, c.name
ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC;
```

Sem arquivo `.sql` dedicado pra tendência de 12 meses — é a mesma agregação de `getMonthlySummary` (só `billedCents`/`costCents`, sem `openCents`/`costAtRiskCents`), chamada 12 vezes com fronteiras diferentes. Ver decisão no design spec (`docs/superpowers/specs/2026-08-11-etapa-4c2-monthly-summary-design.md`).

- [ ] **Step 2: Escrever os testes que falham**

Adicionar ao `queries.integration.test.ts` (import novo: `getCustomerBreakdown, getMonthlyTrend`):

```ts
describe('getCustomerBreakdown', () => {
  it('top e bottom não se sobrepõem quando há poucos clientes', async () => {
    const { supplierA, planA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const customers = await Promise.all(
      Array.from({ length: 5 }, (_, i) => db.customer.create({ data: { name: `Mês Teste Cliente ${i}`, phone: `+551199888${1000 + i}` } })),
    );
    for (const [i, c] of customers.entries()) {
      const sub = await db.subscription.create({ data: { customerId: c.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
      await db.charge.create({ data: { subscriptionId: sub.id, customerId: c.id, supplierId: supplierA.id, principalCents: BigInt((i + 1) * 1000), costCents: 100n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });
    }

    const result = await getCustomerBreakdown(from, to);

    const topIds = result.top.map((r) => r.id);
    const bottomIds = result.bottom.map((r) => r.id);
    expect(topIds.filter((id) => bottomIds.includes(id))).toHaveLength(0);
    expect(topIds.length + bottomIds.length).toBe(5);

    await db.charge.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
  });

  it('top tem no máximo 20 e bottom tem no máximo 20', async () => {
    const { supplierA, planA } = await seedMonthlyFixture();
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const customers = await Promise.all(
      Array.from({ length: 45 }, (_, i) => db.customer.create({ data: { name: `Mês Teste Muitos ${i}`, phone: `+551188877${1000 + i}` } })),
    );
    for (const [i, c] of customers.entries()) {
      const sub = await db.subscription.create({ data: { customerId: c.id, planId: planA.id, supplierId: supplierA.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
      await db.charge.create({ data: { subscriptionId: sub.id, customerId: c.id, supplierId: supplierA.id, principalCents: BigInt((i + 1) * 100), costCents: 50n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });
    }

    const result = await getCustomerBreakdown(from, to);

    expect(result.top).toHaveLength(20);
    expect(result.bottom).toHaveLength(20);
    const topIds = result.top.map((r) => r.id);
    const bottomIds = result.bottom.map((r) => r.id);
    expect(topIds.filter((id) => bottomIds.includes(id))).toHaveLength(0);

    await db.charge.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customers.map((c) => c.id) } } });
    await db.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
  });
});

describe('getMonthlyTrend', () => {
  it('devolve 12 meses em ordem cronológica, cruzando virada de ano', async () => {
    // year=2026, month=1 (fevereiro, 0-indexed) → de março/2025 até fevereiro/2026.
    const rows = await getMonthlyTrend(2026, 1, TZ);

    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual(expect.objectContaining({ year: 2025, month: 2 })); // março/2025
    expect(rows[11]).toEqual(expect.objectContaining({ year: 2026, month: 1 })); // fevereiro/2026
  });

  it('cada mês soma billedCents/costCents do próprio mês', async () => {
    const { customer, supplierA, subA } = await seedMonthlyFixture();
    await db.charge.create({ data: { subscriptionId: subA.id, customerId: customer.id, supplierId: supplierA.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });

    const rows = await getMonthlyTrend(2026, 7, TZ); // termina em agosto/2026

    const august = rows.find((r) => r.year === 2026 && r.month === 7);
    expect(august?.billedCents).toBe('6000');
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: FAIL — `getCustomerBreakdown`/`getMonthlyTrend` não existem.

- [ ] **Step 4: Implementar**

Adicionar ao topo de `queries.ts` o import de `monthBoundsUtc`:

```ts
import { monthBoundsUtc } from '@/core/dates';
```

E ao final do arquivo:

```ts
export interface CustomerBreakdownDTO {
  top: BreakdownRowDTO[];
  bottom: BreakdownRowDTO[];
}

export async function getCustomerBreakdown(from: Date, to: Date): Promise<CustomerBreakdownDTO> {
  const rows = await db.$queryRaw<BreakdownRowDTO[]>`
    SELECT
      c.id AS "id", c.name AS "name",
      COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
      COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
    FROM charges ch
    JOIN customers c ON c.id = ch."customerId"
    WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
      AND ch.status <> 'CANCELLED'
    GROUP BY c.id, c.name
    ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC
  `;

  const top = rows.slice(0, 20);
  // Com <=40 linhas, bottom é "o que sobrou depois do top" — nunca repete cliente na tela.
  const bottom = rows.length <= 40 ? rows.slice(20) : rows.slice(-20);
  return { top, bottom };
}

export interface MonthlyTrendRowDTO {
  year: number;
  month: number; // 0-indexed
  label: string;
  billedCents: string;
  costCents: string;
}

const MONTH_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

type TrendRow = { billedCents: string; costCents: string };

export async function getMonthlyTrend(year: number, month: number, timezone: string): Promise<MonthlyTrendRowDTO[]> {
  const months = Array.from({ length: 12 }, (_, i) => {
    const offset = month - (11 - i);
    const y = year + Math.floor(offset / 12);
    const m = ((offset % 12) + 12) % 12;
    return { year: y, month: m };
  });

  const rows = await Promise.all(
    months.map(async ({ year: y, month: m }) => {
      const { from, to } = monthBoundsUtc(y, m, timezone);
      const result = await db.$queryRaw<TrendRow[]>`
        SELECT
          COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
          COALESCE(SUM("costCents"), 0)::text                        AS "costCents"
        FROM charges
        WHERE "dueAt" >= ${from} AND "dueAt" < ${to}
          AND status <> 'CANCELLED'
      `;
      return { year: y, month: m, label: `${MONTH_ABBR[m]}/${String(y).slice(-2)}`, ...result[0] };
    }),
  );

  return rows;
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: PASS, suíte completa deste arquivo.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/
git commit -m "feat(reports): add customer breakdown (top/bottom 20) and 12-month trend"
```

---

### Task 4: Página `/reports` — resumo, quebras e tendência

**Files:**
- Create: `src/app/(app)/reports/page.tsx`
- Create: `src/features/reports/components/monthly-summary-card.tsx`
- Create: `src/features/reports/components/breakdown-table.tsx`
- Create: `src/features/reports/components/monthly-trend-table.tsx`
- Modify: `src/components/layout/sidebar.tsx`
- Test: `src/features/reports/components/monthly-summary-card.test.tsx`
- Test: `src/features/reports/components/breakdown-table.test.tsx`

**Interfaces:**
- Consumes: `getMonthlySummary`, `getSupplierBreakdown`, `getPlanBreakdown`, `getCustomerBreakdown`, `getMonthlyTrend`, `BreakdownRowDTO`, `MonthlySummaryDTO`, `MonthlyTrendRowDTO` da Task 2/3; `marginPercent`, `formatCents` já existentes; `monthBoundsUtc` já existente.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/reports/components/monthly-summary-card.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlySummaryCard } from './monthly-summary-card';
import type { MonthlySummaryDTO } from '../queries';

function makeSummary(overrides: Partial<MonthlySummaryDTO> = {}): MonthlySummaryDTO {
  return {
    billedCents: '1350000', costCents: '490000', receivedCents: '1188000',
    openCents: '162000', costAtRiskCents: '59000',
    ...overrides,
  };
}

describe('MonthlySummaryCard', () => {
  it('label é "Lucro bruto"', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument();
  });

  it('mostra margem em risco quando há custo em risco', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText(/margem em risco/i)).toBeInTheDocument();
  });

  it('sem custo em risco não mostra a linha de margem em risco', () => {
    render(<MonthlySummaryCard summary={makeSummary({ costAtRiskCents: '0' })} monthLabel="Agosto/2026" />);
    expect(screen.queryByText(/margem em risco/i)).not.toBeInTheDocument();
  });
});
```

Criar `src/features/reports/components/breakdown-table.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreakdownTable } from './breakdown-table';

describe('BreakdownTable', () => {
  it('renderiza nome, faturado, custo, lucro e margem por linha', () => {
    render(<BreakdownTable rows={[{ id: '1', name: 'Tubarão', billedCents: '10000', costCents: '4000' }]} emptyLabel="Sem dados" />);
    expect(screen.getByText('Tubarão')).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument(); // (10000-4000)/10000
  });

  it('lista vazia mostra o texto de vazio, sem tabela', () => {
    render(<BreakdownTable rows={[]} emptyLabel="Sem dados no período" />);
    expect(screen.getByText('Sem dados no período')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- monthly-summary-card.test.tsx breakdown-table.test.tsx`
Expected: FAIL — módulos não existem.

- [ ] **Step 3: Implementar `MonthlySummaryCard`**

Criar `src/features/reports/components/monthly-summary-card.tsx`:

```tsx
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import type { MonthlySummaryDTO } from '../queries';

export function MonthlySummaryCard({ summary, monthLabel }: { summary: MonthlySummaryDTO; monthLabel: string }) {
  const billedCents = BigInt(summary.billedCents);
  const costCents = BigInt(summary.costCents);
  const profitCents = billedCents - costCents;
  const margin = marginPercent(billedCents, costCents);
  const costAtRiskCents = BigInt(summary.costAtRiskCents);

  return (
    <div className="rounded border border-border bg-surface p-5">
      <p className="mb-4 text-lg font-bold text-foreground">{monthLabel}</p>
      <div className="grid grid-cols-2 gap-4 font-mono text-sm tabular-mono sm:grid-cols-4">
        <div>
          <p className="text-xs text-foreground-muted">Faturamento</p>
          <p className="text-foreground">{formatCents(summary.billedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(summary.costCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro bruto</p>
          <p className="text-foreground">
            {formatCents(profitCents)}
            {margin !== null && <span className="ml-2 text-xs text-foreground-muted">margem {margin.toFixed(0)}%</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(summary.receivedCents)}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3 font-mono text-sm tabular-mono">
        <p className="text-xs text-foreground-muted">Em aberto</p>
        <p className="text-foreground">
          {formatCents(summary.openCents)}
          {costAtRiskCents > 0n && (
            <span className="ml-2 text-xs text-warning">⚠ margem em risco: {formatCents(summary.costAtRiskCents)}</span>
          )}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implementar `BreakdownTable`**

Criar `src/features/reports/components/breakdown-table.tsx`:

```tsx
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { EmptyState } from '@/components/ui/empty-state';
import { FileBarChart } from 'lucide-react';
import type { BreakdownRowDTO } from '../queries';

export function BreakdownTable({ rows, emptyLabel }: { rows: BreakdownRowDTO[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={FileBarChart} title={emptyLabel} description="Nenhum lançamento no período selecionado." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            <th className="p-3">Nome</th>
            <th className="p-3 text-right">Faturado</th>
            <th className="p-3 text-right">Custo</th>
            <th className="p-3 text-right">Lucro</th>
            <th className="p-3 text-right">Margem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const billedCents = BigInt(row.billedCents);
            const costCents = BigInt(row.costCents);
            const profitCents = billedCents - costCents;
            const margin = marginPercent(billedCents, costCents);
            return (
              <tr key={row.id} className="border-b border-border font-mono tabular-mono last:border-0">
                <td className="p-3 font-sans text-foreground">{row.name}</td>
                <td className="p-3 text-right text-foreground">{formatCents(row.billedCents)}</td>
                <td className="p-3 text-right text-foreground">{formatCents(row.costCents)}</td>
                <td className="p-3 text-right text-foreground">{formatCents(profitCents)}</td>
                <td className="p-3 text-right text-foreground">{margin === null ? '—' : `${margin.toFixed(0)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Implementar `MonthlyTrendTable`**

Criar `src/features/reports/components/monthly-trend-table.tsx`:

```tsx
import { marginPercent } from '@/core/money';
import type { MonthlyTrendRowDTO } from '../queries';

export function MonthlyTrendTable({ rows }: { rows: MonthlyTrendRowDTO[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            {rows.map((row) => (
              <th key={`${row.year}-${row.month}`} className="p-3 text-center">{row.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((row) => {
              const margin = marginPercent(BigInt(row.billedCents), BigInt(row.costCents));
              return (
                <td key={`${row.year}-${row.month}`} className="p-3 text-center font-mono tabular-mono text-foreground">
                  {margin === null ? '—' : `${margin.toFixed(0)}%`}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Criar a página**

Criar `src/app/(app)/reports/page.tsx`:

```tsx
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/features/settings/queries';
import { monthBoundsUtc, localDateOnly } from '@/core/dates';
import {
  getMonthlySummary,
  getSupplierBreakdown,
  getPlanBreakdown,
  getCustomerBreakdown,
  getMonthlyTrend,
} from '@/features/reports/queries';
import { MonthlySummaryCard } from '@/features/reports/components/monthly-summary-card';
import { BreakdownTable } from '@/features/reports/components/breakdown-table';
import { MonthlyTrendTable } from '@/features/reports/components/monthly-trend-table';

const MONTH_LABEL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function resolveMonth(searchParams: { year?: string; month?: string }, now: Date, timezone: string) {
  const today = localDateOnly(now, timezone);
  const year = searchParams.year ? Number(searchParams.year) : today.getUTCFullYear();
  const month = searchParams.month ? Number(searchParams.month) - 1 : today.getUTCMonth();
  return { year, month };
}

function adjacentMonthHref(year: number, month: number, delta: number) {
  const offset = month + delta;
  const y = year + Math.floor(offset / 12);
  const m = ((offset % 12) + 12) % 12;
  return `/reports?year=${y}&month=${m + 1}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const now = new Date();
  const { year, month } = resolveMonth(params, now, settings.timezone);
  const { from, to } = monthBoundsUtc(year, month, settings.timezone);

  const [summary, suppliers, plans, customers, trend] = await Promise.all([
    getMonthlySummary(from, to),
    getSupplierBreakdown(from, to),
    getPlanBreakdown(from, to),
    getCustomerBreakdown(from, to),
    getMonthlyTrend(year, month, settings.timezone),
  ]);

  const monthLabel = `${MONTH_LABEL[month]}/${year}`;

  return (
    <AppShell title="Relatórios">
      <div className="mb-4 flex items-center gap-3">
        <Link href={adjacentMonthHref(year, month, -1)} className="text-sm text-foreground-muted hover:text-foreground">‹ anterior</Link>
        <Link href={adjacentMonthHref(year, month, 1)} className="text-sm text-foreground-muted hover:text-foreground">próximo ›</Link>
      </div>

      <MonthlySummaryCard summary={summary} monthLabel={monthLabel} />

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-foreground">Margem — últimos 12 meses</p>
        <MonthlyTrendTable rows={trend} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Por fornecedor</p>
        <a href={`/api/reports/export?type=supplier&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={suppliers} emptyLabel="Nenhuma cobrança por fornecedor neste mês" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Por plano</p>
        <a href={`/api/reports/export?type=plan&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={plans} emptyLabel="Nenhuma cobrança por plano neste mês" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Top 20 clientes</p>
        <a href={`/api/reports/export?type=customer&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={customers.top} emptyLabel="Nenhum cliente com cobrança neste mês" />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-foreground">Bottom 20 clientes</p>
        <BreakdownTable rows={customers.bottom} emptyLabel="Nenhum cliente com cobrança neste mês" />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 7: Corrigir o link morto no menu lateral**

Em `src/components/layout/sidebar.tsx`, trocar a entrada existente:

```ts
{ href: '/relatorios', label: 'Relatórios', icon: ChartNoAxesColumn },
```

por:

```ts
{ href: '/reports', label: 'Relatórios', icon: ChartNoAxesColumn },
```

- [ ] **Step 8: Rodar e ver passar**

Run: `pnpm test -- monthly-summary-card.test.tsx breakdown-table.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS, sem erro de tipo novo.

- [ ] **Step 9: Commit**

```bash
git add src/app/"(app)"/reports/ src/features/reports/components/ src/components/layout/sidebar.tsx
git commit -m "feat(reports): add /reports page with monthly summary, breakdowns and trend"
```

---

### Task 5: Export CSV

**Files:**
- Create: `src/app/api/reports/export/route.ts`
- Test: `src/app/api/reports/export/route.integration.test.ts`

**Interfaces:**
- Consumes: `toCsv` da Task 1; `getSupplierBreakdown`, `getPlanBreakdown`, `getCustomerBreakdown` das Tasks 2/3; `requireSession` de `@/features/auth/service` (rota autenticada — está atrás do `(app)` no menu, mas Route Handlers não passam pelo layout, então precisa checar sessão explicitamente; `requireSession` lança `UnauthorizedError` — a rota precisa capturar e devolver 401, não deixar virar 500).

- [ ] **Step 1: Escrever o teste que falha**

Criar `src/app/api/reports/export/route.integration.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { db } from '@/lib/db';
import { GET } from './route';

vi.mock('@/features/auth/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/service')>();
  return { ...actual, requireSession: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@mtconexoes.com.br', name: 'Teste', sessionVersion: 0 }) };
});

afterEach(async () => {
  await db.charge.deleteMany({ where: { customer: { name: 'Export Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Export Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Export Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Export' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor Export' } });
});

describe('GET /api/reports/export', () => {
  it('sem sessão devolve 401', async () => {
    const { requireSession } = await import('@/features/auth/service');
    vi.mocked(requireSession).mockRejectedValueOnce(new Error('unauthorized'));

    const req = new Request('http://localhost/api/reports/export?type=supplier&year=2026&month=8');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('type inválido devolve 400', async () => {
    const req = new Request('http://localhost/api/reports/export?type=invalido&year=2026&month=8');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('type=supplier devolve CSV com header e Content-Disposition de anexo', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Fornecedor Export', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Plano Export', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Export Teste', phone: '+5511997776666' } });
    const sub = await db.subscription.create({ data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
    await db.charge.create({ data: { subscriptionId: sub.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });

    const req = new Request('http://localhost/api/reports/export?type=supplier&year=2026&month=8');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = await res.text();
    expect(body).toContain('Fornecedor Export');
    expect(body).toContain('6000');
  });

  it('type=customer devolve linhas de top e bottom com coluna "grupo"', async () => {
    const req = new Request('http://localhost/api/reports/export?type=customer&year=2026&month=8');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.split('\r\n')[0]).toContain('Grupo');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test:integration -- reports/export/route.integration.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implementar**

Criar `src/app/api/reports/export/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireSession } from '@/features/auth/service';
import { toCsv } from '@/lib/csv';
import { monthBoundsUtc } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import { getSupplierBreakdown, getPlanBreakdown, getCustomerBreakdown, type BreakdownRowDTO } from '@/features/reports/queries';
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';

function rowsToCsv(rows: BreakdownRowDTO[], extraColumn?: (row: BreakdownRowDTO) => string): string {
  const headers = extraColumn ? ['Grupo', 'Nome', 'Faturado', 'Custo', 'Lucro', 'Margem'] : ['Nome', 'Faturado', 'Custo', 'Lucro', 'Margem'];
  const dataRows = rows.map((row) => {
    const billedCents = BigInt(row.billedCents);
    const costCents = BigInt(row.costCents);
    const profitCents = billedCents - costCents;
    const margin = marginPercent(billedCents, costCents);
    const marginText = margin === null ? '—' : `${margin.toFixed(0)}%`;
    const base = [row.name, formatCents(row.billedCents), formatCents(row.costCents), formatCents(profitCents), marginText];
    return extraColumn ? [extraColumn(row), ...base] : base;
  });
  return toCsv(headers, dataRows);
}

export async function GET(req: Request): Promise<Response> {
  try {
    await requireSession();
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month')) - 1;

  if (!type || !['supplier', 'plan', 'customer'].includes(type) || !Number.isFinite(year) || !Number.isFinite(month)) {
    return new NextResponse('Parâmetros inválidos', { status: 400 });
  }

  const settings = await getSettings();
  const { from, to } = monthBoundsUtc(year, month, settings.timezone);

  let csv: string;
  if (type === 'supplier') {
    csv = rowsToCsv(await getSupplierBreakdown(from, to));
  } else if (type === 'plan') {
    csv = rowsToCsv(await getPlanBreakdown(from, to));
  } else {
    const { top, bottom } = await getCustomerBreakdown(from, to);
    const top20 = top.map((r) => ({ ...r, __group: 'top' as const }));
    const bottom20 = bottom.map((r) => ({ ...r, __group: 'bottom' as const }));
    csv = rowsToCsv([...top20, ...bottom20], (row) => (row as unknown as { __group: string }).__group);
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="relatorio-${type}-${year}-${String(month + 1).padStart(2, '0')}.csv"`,
    },
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test:integration -- reports/export/route.integration.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Rodar a suíte completa**

Run: `pnpm test && pnpm test:integration && pnpm exec tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/reports/
git commit -m "feat(reports): add CSV export route for supplier/plan/customer breakdowns"
```
