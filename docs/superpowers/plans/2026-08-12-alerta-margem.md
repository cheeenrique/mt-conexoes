# Alerta de Margem Negativa e Abaixo do Limite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a persistent dashboard banner when active subscriptions are selling at negative margin or below the configured alert threshold — the first real use of `Settings.marginAlertPercent`, which today is configurable but consumed nowhere.

**Architecture:** A pure classifier in `core/money.ts` (reusing the existing `marginPercent`) decides `negative | below_threshold | ok` for one subscription. A single query in `features/subscriptions/queries.ts` fetches every `ACTIVE` subscription's `priceCents`/`costCents` once, classifies in memory, and returns two counts. The dashboard page (already fetching `Settings` for the timezone) passes `marginAlertPercent` in as a parameter — `subscriptions/` never imports `settings/`, matching the project's cross-feature-import rule.

**Tech Stack:** Next.js App Router (Server Components), Prisma, Vitest, `decimal.js` (already a project dependency).

## Global Constraints

- `core/` never imports Prisma, Next.js, or calls `new Date()`/`process.env` — no I/O at all in this task, but the rule still governs where the classifier lives.
- Money stays `BigInt` for cents; percentage stays `Decimal` (`decimal.js`), never a JS `number` — matches `CLAUDE.md` and the existing `marginPercent`/`applyPercent` in `core/money.ts`.
- A feature never imports another feature (`.claude/rules/01-arquitetura.md`) — `features/subscriptions/queries.ts` must not import `features/settings/queries.ts`. The threshold is a parameter, resolved by the page (the composer).
- Reuse `marginPercent` from `core/money.ts` — do not reimplement the percentage math.
- Reuse existing design tokens (`border-danger`, `bg-danger`, `border-warning`, `bg-warning` — all defined in `src/app/globals.css`, already used in `src/features/dunning/components/review-preview.tsx`) — do not invent new ones.
- TDD is mandatory for this task per `CLAUDE.md`'s own list ("margem" is explicitly named as an area requiring red-before-green).

Source spec: `docs/superpowers/specs/2026-08-12-alerta-margem-design.md`.

---

### Task 1: `classifySubscriptionMargin` — pure classifier in `core/money.ts`

**Files:**
- Modify: `src/core/money.ts`
- Modify: `src/core/money.test.ts`

**Interfaces:**
- Consumes: `marginPercent(revenueCents: bigint, costCents: bigint): Decimal | null` — already exported in this same file, do not modify its signature.
- Produces: `export type MarginStatus = 'negative' | 'below_threshold' | 'ok'`, `export function classifySubscriptionMargin(priceCents: bigint, costCents: bigint, alertPercent: Decimal): MarginStatus`.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/money.test.ts` (the file already imports `describe, expect, it` from `vitest` and `Decimal` from `decimal.js`, and `applyPercent, divRoundHalfUp, marginPercent` from `./money` — extend that same import line to add `classifySubscriptionMargin`):

```ts
describe('classifySubscriptionMargin', () => {
  it('price equal to cost is negative, not ok', () => {
    expect(classifySubscriptionMargin(5_000n, 5_000n, new Decimal('30'))).toBe('negative');
  });

  it('price below cost is negative', () => {
    expect(classifySubscriptionMargin(3_000n, 5_000n, new Decimal('30'))).toBe('negative');
  });

  it('zero price is negative, never divides by zero', () => {
    expect(classifySubscriptionMargin(0n, 0n, new Decimal('30'))).toBe('negative');
  });

  it('margin exactly at the threshold is ok, not below_threshold (strict less-than)', () => {
    // price 10000, cost 7000 → margin exactly 30%
    expect(classifySubscriptionMargin(10_000n, 7_000n, new Decimal('30'))).toBe('ok');
  });

  it('margin one point below the threshold is below_threshold', () => {
    // price 10000, cost 7100 → margin 29%
    expect(classifySubscriptionMargin(10_000n, 7_100n, new Decimal('30'))).toBe('below_threshold');
  });

  it('margin well above the threshold is ok', () => {
    expect(classifySubscriptionMargin(10_000n, 2_000n, new Decimal('30'))).toBe('ok');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/money.test.ts`
Expected: FAIL — `classifySubscriptionMargin` is not exported yet.

- [ ] **Step 3: Implement**

In `src/core/money.ts`, append after the existing `marginPercent` function:

```ts
export type MarginStatus = 'negative' | 'below_threshold' | 'ok';

/** priceCents ≤ costCents é sempre 'negative', mesmo quando marginPercent devolveria null
 *  (receita zero). alertPercent vem de Settings.marginAlertPercent, nunca hardcoded. */
export function classifySubscriptionMargin(
  priceCents: bigint,
  costCents: bigint,
  alertPercent: Decimal,
): MarginStatus {
  if (priceCents - costCents <= 0n) return 'negative';
  const margin = marginPercent(priceCents, costCents)!; // priceCents > 0 aqui — nunca null
  return margin.lessThan(alertPercent) ? 'below_threshold' : 'ok';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/money.test.ts`
Expected: PASS, all 6 new cases (plus the 5 pre-existing `divRoundHalfUp`/`applyPercent`/`marginPercent` cases, unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/core/money.ts src/core/money.test.ts
git commit -m "feat(core): add classifySubscriptionMargin for negative/below-threshold alerts"
```

---

### Task 2: `getMarginAlertSummary` query

**Files:**
- Modify: `src/features/subscriptions/queries.ts`
- Create: `src/features/subscriptions/queries.integration.test.ts`

**Interfaces:**
- Consumes: `classifySubscriptionMargin`, `type MarginStatus` from `@/core/money` (Task 1). `db` from `@/lib/db` — already imported in this file. `Decimal` from `decimal.js` (new import in this file).
- Produces: `export type MarginAlertSummary = { negativeCount: number; belowThresholdCount: number }`, `export async function getMarginAlertSummary(alertPercent: Decimal): Promise<MarginAlertSummary>`.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/features/subscriptions/queries.integration.test.ts
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getMarginAlertSummary } from './queries';

let customerId: string;

async function createSubscription(opts: { priceCents: bigint; costCents: bigint; status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' }) {
  return db.subscription.create({
    data: {
      customerId,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-09-01T02:59:59.000Z'),
      status: opts.status ?? 'ACTIVE',
    },
  });
}

afterEach(async () => {
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });
});

describe('getMarginAlertSummary', () => {
  it('counts negative and below-threshold active subscriptions separately, ignores ok and non-active', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Margem ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 5_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 3_000n, costCents: 5_000n }); // negative
    await createSubscription({ priceCents: 10_000n, costCents: 7_100n }); // below_threshold (29% < 30%)
    await createSubscription({ priceCents: 10_000n, costCents: 2_000n }); // ok (80%)
    await createSubscription({ priceCents: 1_000n, costCents: 5_000n, status: 'SUSPENDED' }); // negative but not ACTIVE — excluded

    const summary = await getMarginAlertSummary(new Decimal('30'));

    expect(summary.negativeCount).toBe(2);
    expect(summary.belowThresholdCount).toBe(1);
  });

  it('returns zero counts when every active subscription is healthy', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Margem OK ${randomUUID()}` } });
    customerId = customer.id;

    await createSubscription({ priceCents: 10_000n, costCents: 1_000n });

    const summary = await getMarginAlertSummary(new Decimal('30'));

    expect(summary.negativeCount).toBe(0);
    expect(summary.belowThresholdCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:integration -- src/features/subscriptions/queries.integration.test.ts`
Expected: FAIL — `getMarginAlertSummary` is not exported yet.

- [ ] **Step 3: Implement**

Add near the top of `src/features/subscriptions/queries.ts`, extending the existing import lines:

```ts
import Decimal from 'decimal.js';
import { classifySubscriptionMargin } from '@/core/money';
```

Append the new type and function at the end of the file:

```ts
export type MarginAlertSummary = { negativeCount: number; belowThresholdCount: number };

/** alertPercent entra por parâmetro — esta feature não importa features/settings.
 *  O caller (page.tsx) já busca Settings pra outra coisa e repassa o valor. */
export async function getMarginAlertSummary(alertPercent: Decimal): Promise<MarginAlertSummary> {
  const subscriptions = await db.subscription.findMany({
    where: { status: 'ACTIVE' },
    select: { priceCents: true, costCents: true },
  });

  const statuses = subscriptions.map((s) => classifySubscriptionMargin(s.priceCents, s.costCents, alertPercent));

  return {
    negativeCount: statuses.filter((s) => s === 'negative').length,
    belowThresholdCount: statuses.filter((s) => s === 'below_threshold').length,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:integration -- src/features/subscriptions/queries.integration.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/subscriptions/queries.ts src/features/subscriptions/queries.integration.test.ts
git commit -m "feat(subscriptions): add getMarginAlertSummary query"
```

---

### Task 3: `MarginAlertBanner` component + page wiring

**Files:**
- Create: `src/features/subscriptions/components/margin-alert-banner.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `MarginAlertSummary`, `getMarginAlertSummary` from `@/features/subscriptions/queries` (Task 2). `getSettings` — already imported in `page.tsx`.
- Produces: `export function MarginAlertBanner({ summary }: { summary: MarginAlertSummary }): JSX.Element | null`.

- [ ] **Step 1: Create the component**

```tsx
// src/features/subscriptions/components/margin-alert-banner.tsx
import type { MarginAlertSummary } from '../queries';

export function MarginAlertBanner({ summary }: { summary: MarginAlertSummary }) {
  if (summary.negativeCount === 0 && summary.belowThresholdCount === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {summary.negativeCount > 0 && (
        <div className="rounded-sm border border-danger/40 bg-danger/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.negativeCount} assinatura{summary.negativeCount > 1 ? 's' : ''} com margem negativa
          </p>
          <p className="text-sm text-foreground-muted">Vendendo abaixo do custo. Revisar preço ou custo.</p>
        </div>
      )}
      {summary.belowThresholdCount > 0 && (
        <div className="rounded-sm border border-warning/40 bg-warning/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.belowThresholdCount} assinatura{summary.belowThresholdCount > 1 ? 's' : ''} com margem abaixo do limite
          </p>
        </div>
      )}
    </div>
  );
}
```

Note: `border-danger`/`bg-danger`/`border-warning`/`bg-warning` are pre-existing theme tokens (`src/app/globals.css`), same pattern already used in `src/features/dunning/components/review-preview.tsx` — reuse as-is, do not invent new classes.

- [ ] **Step 2: Wire the page**

Modify `src/app/(app)/page.tsx` — add two imports and thread the new query through the existing `Promise.all`:

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { getDueDateOverview } from '@/features/charges/queries';
import { getSettings } from '@/features/settings/queries';
import { DashboardPanel } from '@/features/charges/components/dashboard-panel';
import { listOperatorAlerts } from '@/features/dunning/queries';
import { OperatorAlerts } from '@/features/dunning/components/operator-alerts';
import { getMarginAlertSummary } from '@/features/subscriptions/queries';
import { MarginAlertBanner } from '@/features/subscriptions/components/margin-alert-banner';
import { DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';
import Decimal from 'decimal.js';

function parseBucket(raw: string | undefined): DueDateBucket {
  return (DUE_DATE_BUCKETS as readonly string[]).includes(raw ?? '') ? (raw as DueDateBucket) : 'D0';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const params = await searchParams;
  const selectedBucket = parseBucket(params.bucket);

  const now = new Date();
  const settings = await getSettings();
  const [overview, alerts, marginAlerts] = await Promise.all([
    getDueDateOverview(now, settings.timezone),
    listOperatorAlerts(),
    getMarginAlertSummary(new Decimal(settings.marginAlertPercent)),
  ]);

  return (
    <AppShell title="Painel">
      <DashboardPanel overview={overview} selectedBucket={selectedBucket} timezone={settings.timezone} />
      <MarginAlertBanner summary={marginAlerts} />
      <OperatorAlerts alerts={alerts} timezone={settings.timezone} />
    </AppShell>
  );
}
```

- [ ] **Step 3: Verify the build and full test suite**

Run: `pnpm typecheck`
Expected: clean.

Run: `pnpm lint`
Expected: 0 errors.

Run: `pnpm test && pnpm test:integration`
Expected: full suite PASS, including Tasks 1 and 2's new tests, no regressions.

Run: `pnpm build`
Expected: succeeds, confirming the page/component wiring is structurally sound. (If the known pre-existing Google Fonts/Turbopack network issue reappears — check `src/app/layout.tsx` is untouched by this diff before treating it as caused by this task; rely on `pnpm typecheck` if so.)

- [ ] **Step 4: Commit**

```bash
git add src/features/subscriptions/components/margin-alert-banner.tsx "src/app/(app)/page.tsx"
git commit -m "feat(dashboard): show negative/below-threshold margin alert banner

Settings.marginAlertPercent was configurable but consumed nowhere. First
real use of it — dashboard now surfaces active subscriptions selling at
or below cost, and ones below the configured margin threshold."
```

---

## What this plan deliberately does not cover

- No clickable link from the banner to a filtered subscription list — `/assinaturas` doesn't exist yet.
- "Custo do fornecedor subiu" (bulk reajuste) and "cliente bom em atraso" alerts — separate features, not touched here.
- No change to `Settings` or the Ajustes screen — `marginAlertPercent` already exists there.
