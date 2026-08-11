# Etapa 4c-1 — Painel de lucro por cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os números zerados do header da ficha do cliente por dados reais — faturado, recebido, custo, lucro bruto, margem, renovações, histórico de atraso — via query nova em `features/reports/`.

**Architecture:** Primeira instância de `features/reports/` no projeto. SQL versionado em `features/reports/sql/customer-pnl.sql`, executado via `db.$queryRaw` (tagged template, parametrizado). Componente `CustomerProfileHeader` recebe os centavos brutos e computa lucro/margem via `core/money` (mesmo padrão já usado em `plan-table.tsx`).

**Tech Stack:** Next.js Server Component, Prisma `$queryRaw`, Vitest (unit + integração contra Postgres real), Testing Library.

## Global Constraints

- `core/money.ts` já existe e já está testado (`divRoundHalfUp`, `applyPercent`, `marginPercent`) — não modificar, só importar.
- `BigInt` em centavos, sufixo `Cents`, nunca `number`/`float` em nenhum ponto do caminho — nem em variável temporária dentro da query.
- `$queryRawUnsafe` proibido. Só `$queryRaw` com tagged template (parametrização automática do Prisma) ou `Prisma.sql`.
- Label da UI é **"Lucro bruto"**, nunca "Lucro" puro — regra dura do doc de domínio (`04-dinheiro-e-margem.md`).
- Cobrança `CANCELLED` nunca entra em nenhuma soma/contagem deste painel.
- DTO devolve `string` pra todo campo monetário — nenhum `BigInt` cruza pra componente cliente (aqui nem é necessário, o componente é Server Component, mas o DTO segue a convenção do projeto de qualquer forma).
- Nenhum modelo Prisma devolvido direto — sempre DTO explícito.

---

### Task 1: Query `getCustomerPnl` em `features/reports/`

**Files:**
- Create: `src/features/reports/sql/customer-pnl.sql`
- Create: `src/features/reports/queries.ts`
- Test: `src/features/reports/queries.integration.test.ts`

**Interfaces:**
- Produces: `export interface CustomerPnlDTO { billedCents: string; receivedCents: string; costCents: string; chargesCount: number; paidCount: number; overdueCount: number; openCount: number }` e `export async function getCustomerPnl(customerId: string): Promise<CustomerPnlDTO>` — consumidos pela Task 2.

- [ ] **Step 1: Criar o arquivo de referência SQL**

Criar `src/features/reports/sql/customer-pnl.sql` (texto de referência versionado — a query executada em `queries.ts` usa o mesmo texto, ver Step 3):

```sql
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
SELECT COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents"
FROM payments p
JOIN charges ch ON ch.id = p."chargeId"
WHERE ch."customerId" = $1;
```

- [ ] **Step 2: Escrever o teste de integração que falha**

Criar `src/features/reports/queries.integration.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { ChargeStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getCustomerPnl } from './queries';

async function seedCustomerWithCharges() {
  const supplier = await db.supplier.create({ data: { name: 'Fornecedor PNL', unitCostCents: 1000n } });
  const plan = await db.plan.create({ data: { name: 'Plano PNL', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
  const customer = await db.customer.create({ data: { name: 'PNL Teste', phone: '+5511998880777' } });
  const subscription = await db.subscription.create({
    data: {
      customerId: customer.id, planId: plan.id, supplierId: supplier.id,
      priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE',
      startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z'),
    },
  });
  return { supplier, plan, customer, subscription };
}

async function createCharge(
  subscriptionId: string, customerId: string, supplierId: string,
  overrides: { principalCents?: bigint; discountCents?: bigint; costCents?: bigint; status?: ChargeStatus; periodStart: Date },
) {
  return db.charge.create({
    data: {
      subscriptionId, customerId, supplierId,
      principalCents: overrides.principalCents ?? 6000n,
      discountCents: overrides.discountCents ?? 0n,
      costCents: overrides.costCents ?? 1000n,
      periodStart: overrides.periodStart,
      periodEnd: overrides.periodStart,
      dueAt: overrides.periodStart,
      status: overrides.status ?? 'OPEN',
    },
  });
}

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customer: { name: 'PNL Teste' } } } });
  await db.charge.deleteMany({ where: { customer: { name: 'PNL Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'PNL Teste' } } });
  await db.customer.deleteMany({ where: { name: 'PNL Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano PNL' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor PNL' } });
});

describe('getCustomerPnl', () => {
  it('cliente sem nenhuma cobrança: tudo zerado, sem lançar', async () => {
    const { customer } = await seedCustomerWithCharges();

    const result = await getCustomerPnl(customer.id);

    expect(result).toEqual({
      billedCents: '0', receivedCents: '0', costCents: '0',
      chargesCount: 0, paidCount: 0, overdueCount: 0, openCount: 0,
    });
  });

  it('cobrança CANCELLED não entra em nenhuma soma nem contagem', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'CANCELLED' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'OPEN' });

    const result = await getCustomerPnl(customer.id);

    expect(result.chargesCount).toBe(1);
    expect(result.billedCents).toBe('6000');
  });

  it('desconto reduz billedCents mas não costCents', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    await createCharge(subscription.id, customer.id, supplier.id, {
      periodStart: new Date('2026-01-01'), principalCents: 6000n, discountCents: 1000n, costCents: 1000n, status: 'PAID',
    });

    const result = await getCustomerPnl(customer.id);

    expect(result.billedCents).toBe('5000');
    expect(result.costCents).toBe('1000');
  });

  it('receivedCents soma pagamentos de todas as cobranças do cliente', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    const charge1 = await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'PAID' });
    const charge2 = await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'PARTIALLY_PAID' });
    await db.payment.create({ data: { chargeId: charge1.id, amountCents: 6000n, paidAt: new Date('2026-01-05') } });
    await db.payment.create({ data: { chargeId: charge2.id, amountCents: 2000n, paidAt: new Date('2026-02-05') } });

    const result = await getCustomerPnl(customer.id);

    expect(result.receivedCents).toBe('8000');
  });

  it('paidCount + overdueCount + openCount somam chargesCount quando não há CANCELLED', async () => {
    const { customer, subscription, supplier } = await seedCustomerWithCharges();
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-01-01'), status: 'PAID' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-02-01'), status: 'OVERDUE' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-03-01'), status: 'OPEN' });
    await createCharge(subscription.id, customer.id, supplier.id, { periodStart: new Date('2026-04-01'), status: 'PARTIALLY_PAID' });

    const result = await getCustomerPnl(customer.id);

    expect(result.chargesCount).toBe(4);
    expect(result.paidCount + result.overdueCount + result.openCount).toBe(4);
    expect(result.paidCount).toBe(1);
    expect(result.overdueCount).toBe(1);
    expect(result.openCount).toBe(2);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: FAIL — `Cannot find module './queries'`.

- [ ] **Step 4: Implementar**

Criar `src/features/reports/queries.ts`:

```ts
import { db } from '@/lib/db';

export interface CustomerPnlDTO {
  billedCents: string;
  receivedCents: string;
  costCents: string;
  chargesCount: number;
  paidCount: number;
  overdueCount: number;
  openCount: number;
}

type BilledRow = {
  billedCents: string;
  costCents: string;
  chargesCount: number;
  paidCount: number;
  overdueCount: number;
  openCount: number;
};

type ReceivedRow = { receivedCents: string };

export async function getCustomerPnl(customerId: string): Promise<CustomerPnlDTO> {
  const [billed, received] = await Promise.all([
    db.$queryRaw<BilledRow[]>`
      SELECT
        COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
        COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
        COUNT(*)::int                                               AS "chargesCount",
        COUNT(*) FILTER (WHERE status = 'PAID')::int                AS "paidCount",
        COUNT(*) FILTER (WHERE status = 'OVERDUE')::int              AS "overdueCount",
        COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_PAID'))::int AS "openCount"
      FROM charges
      WHERE "customerId" = ${customerId}
        AND status <> 'CANCELLED'
    `,
    db.$queryRaw<ReceivedRow[]>`
      SELECT COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents"
      FROM payments p
      JOIN charges ch ON ch.id = p."chargeId"
      WHERE ch."customerId" = ${customerId}
    `,
  ]);

  const b = billed[0];
  const r = received[0];

  return {
    billedCents: b.billedCents,
    receivedCents: r.receivedCents,
    costCents: b.costCents,
    chargesCount: b.chargesCount,
    paidCount: b.paidCount,
    overdueCount: b.overdueCount,
    openCount: b.openCount,
  };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `pnpm test:integration -- reports/queries.integration.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add src/features/reports/
git commit -m "feat(reports): add getCustomerPnl query"
```

---

### Task 2: Wire no `CustomerProfileHeader`

**Files:**
- Modify: `src/features/customers/components/customer-profile-header.tsx`
- Modify: `src/app/(app)/customers/[id]/page.tsx`
- Test: `src/features/customers/components/customer-profile-header.test.tsx` (novo)

**Interfaces:**
- Consumes: `CustomerPnlDTO`, `getCustomerPnl` da Task 1; `marginPercent`, `formatCents` já existentes.

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/features/customers/components/customer-profile-header.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerProfileHeader } from './customer-profile-header';
import type { CustomerPnlDTO } from '@/features/reports/queries';

function makePnl(overrides: Partial<CustomerPnlDTO> = {}): CustomerPnlDTO {
  return {
    billedCents: '264000', receivedCents: '258000', costCents: '68000',
    chargesCount: 46, paidCount: 44, overdueCount: 2, openCount: 0,
    ...overrides,
  };
}

describe('CustomerProfileHeader', () => {
  it('label é "Lucro bruto", nunca "Lucro" puro', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl()} />);
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument();
    expect(screen.queryByText(/^Lucro$/)).not.toBeInTheDocument();
  });

  it('mostra margem calculada', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl()} />);
    // (264000-68000)/264000 = 74.24...% → toFixed(0) = 74%
    expect(screen.getByText(/margem 74%/)).toBeInTheDocument();
  });

  it('sem cobrança: margem mostra travessão, sem Renovações/Histórico', () => {
    render(<CustomerProfileHeader name="João" supplierName={null} since="—" active={false} pnl={makePnl({
      billedCents: '0', receivedCents: '0', costCents: '0', chargesCount: 0, paidCount: 0, overdueCount: 0, openCount: 0,
    })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/Renovações/)).not.toBeInTheDocument();
  });

  it('pluraliza atraso no singular', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl({ overdueCount: 1 })} />);
    expect(screen.getByText(/1 atraso ·/)).toBeInTheDocument();
  });

  it('pluraliza atrasos no plural', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl({ overdueCount: 2 })} />);
    expect(screen.getByText(/2 atrasos ·/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm test -- customer-profile-header.test.tsx`
Expected: FAIL — `CustomerProfileHeader` ainda não aceita prop `pnl`, textos não batem.

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `src/features/customers/components/customer-profile-header.tsx`:

```tsx
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { StatusBadge } from '@/components/ui/status-badge';
import type { CustomerPnlDTO } from '@/features/reports/queries';

export function CustomerProfileHeader({
  name,
  supplierName,
  since,
  active,
  pnl,
}: {
  name: string;
  supplierName: string | null;
  since: string;
  active: boolean;
  pnl: CustomerPnlDTO;
}) {
  const billedCents = BigInt(pnl.billedCents);
  const costCents = BigInt(pnl.costCents);
  const profitCents = billedCents - costCents;
  const margin = marginPercent(billedCents, costCents);
  const atrasoLabel = pnl.overdueCount === 1 ? 'atraso' : 'atrasos';

  return (
    <div className="rounded border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-foreground">{name}</p>
          <p className="text-sm text-foreground-muted">
            {supplierName ? `Fornecedor: ${supplierName} · ` : ''}cliente desde {since}
          </p>
        </div>
        <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? 'ATIVO' : 'SEM ASSINATURA'}</StatusBadge>
      </div>
      <div className="grid grid-cols-4 gap-4 border-t border-border pt-4 font-mono text-sm tabular-mono">
        <div>
          <p className="text-xs text-foreground-muted">Faturado</p>
          <p className="text-foreground">{formatCents(pnl.billedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(pnl.receivedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(pnl.costCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro bruto</p>
          <p className="text-foreground">
            {formatCents(profitCents)}
            {margin !== null && <span className="ml-2 text-xs text-foreground-muted">margem {margin.toFixed(0)}%</span>}
            {margin === null && <span className="ml-2 text-xs text-foreground-muted">—</span>}
          </p>
        </div>
      </div>
      {pnl.chargesCount > 0 && (
        <div className="mt-3 flex gap-6 text-xs text-foreground-muted">
          <span>Renovações {pnl.paidCount}</span>
          <span>Histórico {pnl.overdueCount} {atrasoLabel} · {pnl.openCount} em aberto</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm test -- customer-profile-header.test.tsx`
Expected: PASS, 5 testes.

- [ ] **Step 5: Wire na página**

Em `src/app/(app)/customers/[id]/page.tsx`, adicionar o import e a chamada:

```ts
import { getCustomerPnl } from '@/features/reports/queries';
```

No `Promise.all`, adicionar `getCustomerPnl(id)` à lista e capturar o resultado (`pnl`):

```ts
const [subscriptions, plans, suppliers, settings, charges, messages, pnl] = await Promise.all([
  listSubscriptionsForCustomer(id),
  listActivePlansForSelect(),
  listActiveSuppliersForSelect(),
  getSettings(),
  getChargesForCustomer(id),
  listMessagesForCustomer(id),
  getCustomerPnl(id),
]);
```

E passar a prop nova pro header:

```tsx
<CustomerProfileHeader
  name={customer.name}
  supplierName={activeSub?.supplierName ?? null}
  since={since}
  active={!!activeSub}
  pnl={pnl}
/>
```

- [ ] **Step 6: Rodar a suíte completa e o typecheck**

Run: `pnpm test && pnpm test:integration && pnpm exec tsc --noEmit`
Expected: tudo verde, sem erro de tipo novo.

- [ ] **Step 7: Commit**

```bash
git add src/features/customers/components/customer-profile-header.tsx src/features/customers/components/customer-profile-header.test.tsx "src/app/(app)/customers/[id]/page.tsx"
git commit -m "feat(customers): show real profit/margin numbers on customer header"
```
