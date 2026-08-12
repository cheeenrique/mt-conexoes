# Dashboard — Faixa de Vencimento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's 4 generic stat cards with a horizontal due-date-bucket strip that filters an in-place list via URL search params, matching `docs/projeto/design/02-handoff-painel.md`.

**Architecture:** A pure function in `core/` classifies a charge's due date into one of 6 fixed buckets relative to "now". A single query fetches every open/overdue/partially-paid charge once, buckets it in memory, and returns both the per-bucket aggregates and the full tagged list. The dashboard page reads the selected bucket from `searchParams` (URL-driven, no client state) and renders the strip plus the filtered slice.

**Tech Stack:** Next.js App Router (Server Components), Prisma, Vitest (`pnpm test` unit, `pnpm test:integration` against real Postgres).

## Global Constraints

- `core/` never imports Prisma, Next.js, or calls `new Date()` — `now`/`timezone` are always parameters (`.claude/rules/01-arquitetura.md`).
- Money stays `BigInt`/string-of-cents end to end; no `Number()` on a cents value (`CLAUDE.md`).
- Filter state lives in the URL (`searchParams`), never `useState` (`.claude/rules/04-frontend.md`).
- No silent caps: if the filtered list is truncated, say so in the UI (dataviz principle already used elsewhere in this codebase's lists).
- Integration tests run against real Postgres via `pnpm test:integration` (`vitest.integration.config.ts`), matching the existing pattern in `src/features/charges/service.integration.test.ts`.
- Reuse `daysFromDue` from `src/core/dunning-rules.ts` — do not reimplement due-date-offset math.

Source spec: `docs/superpowers/specs/2026-08-11-dashboard-linha-de-vencimento-design.md`.

---

### Task 1: `core/due-date-buckets.ts` — pure bucket resolver

**Files:**
- Create: `src/core/due-date-buckets.ts`
- Test: `src/core/due-date-buckets.test.ts`

**Interfaces:**
- Consumes: `daysFromDue(dueAt: Date, now: Date, timezone: string): number` from `src/core/dunning-rules.ts` (already exists — negative = before due, positive = after, per that file's own doc comment).
- Produces:
  - `export type DueDateBucket = 'D-5' | 'D-2' | 'D0' | 'D+1' | 'D+3' | 'D+5'`
  - `export const DUE_DATE_BUCKETS: readonly DueDateBucket[]` — in display order, left to right.
  - `export function resolveDueDateBucket(dueAt: Date, now: Date, timezone: string): DueDateBucket`

- [ ] **Step 1: Write the failing tests**

```ts
// src/core/due-date-buckets.test.ts
import { describe, expect, it } from 'vitest';
import { resolveDueDateBucket, DUE_DATE_BUCKETS } from './due-date-buckets';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-15T15:00:00.000Z'); // 15/08 local

/** Devolve um `dueAt` tal que `daysFromDue(dueAt, NOW, TZ) === offset` — mesma convenção
 *  de sinal de `daysFromDue`: offset negativo = due no futuro (a vencer), positivo = due
 *  no passado (atrasada). Por isso é `NOW - offset`, não `NOW + offset`. */
function dueAtOffset(offset: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

describe('resolveDueDateBucket — boundaries', () => {
  it('offset -4 (exactly on the D-5/D-2 boundary) resolves D-5', () => {
    expect(resolveDueDateBucket(dueAtOffset(-4), NOW, TZ)).toBe('D-5');
  });

  it('offset -3 (one past the boundary) resolves D-2', () => {
    expect(resolveDueDateBucket(dueAtOffset(-3), NOW, TZ)).toBe('D-2');
  });

  it('offset -1 (last day before due) resolves D-2', () => {
    expect(resolveDueDateBucket(dueAtOffset(-1), NOW, TZ)).toBe('D-2');
  });

  it('offset 0 (due today) resolves D0', () => {
    expect(resolveDueDateBucket(dueAtOffset(0), NOW, TZ)).toBe('D0');
  });

  it('offset 1 (one day late) resolves D+1', () => {
    expect(resolveDueDateBucket(dueAtOffset(1), NOW, TZ)).toBe('D+1');
  });

  it('offset 2 (still within D+1) resolves D+1', () => {
    expect(resolveDueDateBucket(dueAtOffset(2), NOW, TZ)).toBe('D+1');
  });

  it('offset 3 (crosses into D+3) resolves D+3', () => {
    expect(resolveDueDateBucket(dueAtOffset(3), NOW, TZ)).toBe('D+3');
  });

  it('offset 4 (last day of D+3) resolves D+3', () => {
    expect(resolveDueDateBucket(dueAtOffset(4), NOW, TZ)).toBe('D+3');
  });

  it('offset 5 (crosses into the D+5 catch-all) resolves D+5', () => {
    expect(resolveDueDateBucket(dueAtOffset(5), NOW, TZ)).toBe('D+5');
  });
});

describe('resolveDueDateBucket — far catch-alls, nothing falls through', () => {
  it('30 days overdue still resolves D+5, not undefined', () => {
    expect(resolveDueDateBucket(dueAtOffset(30), NOW, TZ)).toBe('D+5');
  });

  it('30 days in the future still resolves D-5, not undefined', () => {
    expect(resolveDueDateBucket(dueAtOffset(-30), NOW, TZ)).toBe('D-5');
  });
});

describe('DUE_DATE_BUCKETS', () => {
  it('has exactly the 6 buckets, in display order', () => {
    expect(DUE_DATE_BUCKETS).toEqual(['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/core/due-date-buckets.test.ts`
Expected: FAIL — `due-date-buckets.ts` does not exist yet.

- [ ] **Step 3: Implement**

```ts
// src/core/due-date-buckets.ts
import { daysFromDue } from './dunning-rules';

export type DueDateBucket = 'D-5' | 'D-2' | 'D0' | 'D+1' | 'D+3' | 'D+5';

export const DUE_DATE_BUCKETS: readonly DueDateBucket[] = ['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5'];

/** Classifica uma cobrança pelo balde de vencimento, ancorado em `now`.
 *  offset negativo = a vencer; positivo = atrasada. Intervalos fechados, sem gap:
 *  D-5 ≤-4 · D-2 -3..-1 · D0 =0 · D+1 1..2 · D+3 3..4 · D+5 ≥5. */
export function resolveDueDateBucket(dueAt: Date, now: Date, timezone: string): DueDateBucket {
  const offset = daysFromDue(dueAt, now, timezone);
  if (offset <= -4) return 'D-5';
  if (offset <= -1) return 'D-2';
  if (offset === 0) return 'D0';
  if (offset <= 2) return 'D+1';
  if (offset <= 4) return 'D+3';
  return 'D+5';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/core/due-date-buckets.test.ts`
Expected: PASS, all 12 cases.

- [ ] **Step 5: Commit**

```bash
git add src/core/due-date-buckets.ts src/core/due-date-buckets.test.ts
git commit -m "feat(core): add pure due-date bucket resolver for dashboard strip"
```

---

### Task 2: labels + `getDueDateOverview` query

**Files:**
- Modify: `src/lib/labels.ts`
- Modify: `src/features/charges/queries.ts`
- Create: `src/features/charges/queries.integration.test.ts`

**Interfaces:**
- Consumes: `DueDateBucket`, `DUE_DATE_BUCKETS`, `resolveDueDateBucket` from `@/core/due-date-buckets` (Task 1). `ChargeDTO`, `toChargeDTO`, `CHARGE_INCLUDE` — already defined in this same file, unexported; stay unexported, reused in-file. `monthBoundsUtc` from `@/core/dates` — already imported in this file.
- Produces:
  - `DUE_DATE_BUCKET_LABELS: Record<DueDateBucket, string>` in `src/lib/labels.ts`.
  - `export type DueDateOverview = { buckets: { key: DueDateBucket; label: string; count: number; amountCents: string }[]; charges: (ChargeDTO & { bucket: DueDateBucket })[]; receivedThisMonthCents: string }` in `queries.ts`.
  - `export async function getDueDateOverview(now: Date, timezone: string): Promise<DueDateOverview>` in `queries.ts`, replacing `getDashboardSummary` (removed — its only caller, `src/app/(app)/page.tsx`, is rewired in Task 3; grep for other callers before deleting).

- [ ] **Step 1: Add the labels**

Add to `src/lib/labels.ts` (append near `CHARGE_STATUS_LABELS`, same file, same pattern):

```ts
export const DUE_DATE_BUCKET_LABELS: Record<string, string> = {
  'D-5': 'D-5',
  'D-2': 'D-2',
  'D0': 'HOJE',
  'D+1': 'D+1',
  'D+3': 'D+3',
  'D+5': 'D+5+',
};
```

- [ ] **Step 2: Write the failing integration test**

```ts
// src/features/charges/queries.integration.test.ts
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getDueDateOverview } from './queries';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-15T15:00:00.000Z');

let customerId: string;
let subscriptionId: string;

async function createCharge(dueAt: Date, opts: { principalCents?: bigint; status?: string; paidCents?: bigint } = {}) {
  const charge = await db.charge.create({
    data: {
      subscriptionId,
      customerId,
      principalCents: opts.principalCents ?? 10000n,
      discountCents: 0n,
      periodStart: new Date('2026-07-15T00:00:00.000Z'),
      periodEnd: new Date('2026-08-14T00:00:00.000Z'),
      dueAt,
      status: (opts.status ?? 'OPEN') as never,
    },
  });
  if (opts.paidCents) {
    await db.payment.create({ data: { chargeId: charge.id, amountCents: opts.paidCents, paidAt: NOW } });
  }
  return charge;
}

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: `Cliente Dashboard ${randomUUID()}` } });
  customerId = customer.id;
  const subscription = await db.subscription.create({
    data: { customerId, priceCents: 10000n, cycle: 'MONTHLY', nextDueAt: NOW },
  });
  subscriptionId = subscription.id;
});

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customerId } } });
  await db.charge.deleteMany({ where: { customerId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.delete({ where: { id: customerId } });
});

describe('getDueDateOverview', () => {
  it('buckets each charge by due date and sums the outstanding amount per bucket', async () => {
    await createCharge(new Date('2026-08-15T23:59:59.000Z')); // due hoje (15/08) → D0, 10000 owed
    await createCharge(new Date('2026-08-14T23:59:59.000Z'), { status: 'OVERDUE' }); // due ontem (14/08) → D+1, 10000 owed
    await createCharge(new Date('2026-08-14T23:59:59.000Z'), { principalCents: 5000n, paidCents: 2000n }); // due ontem → D+1, 3000 owed (partial)

    const overview = await getDueDateOverview(NOW, TZ);

    const d0 = overview.buckets.find((b) => b.key === 'D0')!;
    expect(d0.count).toBe(1);
    expect(d0.amountCents).toBe('10000');

    const dPlus1 = overview.buckets.find((b) => b.key === 'D+1')!;
    expect(dPlus1.count).toBe(2);
    expect(dPlus1.amountCents).toBe('13000');
  });

  it('excludes PAID and CANCELLED charges from every bucket', async () => {
    await createCharge(new Date('2026-08-15T23:59:59.000Z'), { status: 'PAID' });
    await createCharge(new Date('2026-08-15T23:59:59.000Z'), { status: 'CANCELLED' });

    const overview = await getDueDateOverview(NOW, TZ);

    const total = overview.buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(0);
    expect(overview.charges).toHaveLength(0);
  });

  it('tags each returned charge with its bucket', async () => {
    const charge = await createCharge(new Date('2026-08-20T23:59:59.000Z')); // 5 days out → D-5

    const overview = await getDueDateOverview(NOW, TZ);

    const tagged = overview.charges.find((c) => c.id === charge.id);
    expect(tagged?.bucket).toBe('D-5');
  });

  it('all 6 buckets are present even when empty, count 0', async () => {
    const overview = await getDueDateOverview(NOW, TZ);
    expect(overview.buckets.map((b) => b.key)).toEqual(['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5']);
    expect(overview.buckets.every((b) => b.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm test:integration -- src/features/charges/queries.integration.test.ts`
Expected: FAIL — `getDueDateOverview` is not exported yet.

- [ ] **Step 4: Implement the query**

In `src/features/charges/queries.ts`, add the import and the new function, and delete `getDashboardSummary`:

```ts
// add to the existing import block at the top of the file
import { resolveDueDateBucket, DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';
import { DUE_DATE_BUCKET_LABELS } from '@/lib/labels';
```

```ts
export type DueDateOverview = {
  buckets: { key: DueDateBucket; label: string; count: number; amountCents: string }[];
  charges: (ChargeDTO & { bucket: DueDateBucket })[];
  receivedThisMonthCents: string;
};

export async function getDueDateOverview(now: Date, timezone: string): Promise<DueDateOverview> {
  const [rows, monthPayments] = await Promise.all([
    db.charge.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
      include: CHARGE_INCLUDE,
      orderBy: { dueAt: 'asc' },
    }),
    (() => {
      const { from, to } = monthBoundsUtc(now.getUTCFullYear(), now.getUTCMonth(), timezone);
      return db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } });
    })(),
  ]);

  const charges = rows.map((r) => ({
    ...toChargeDTO(r),
    bucket: resolveDueDateBucket(r.dueAt, now, timezone),
  }));

  const buckets = DUE_DATE_BUCKETS.map((key) => {
    const inBucket = charges.filter((c) => c.bucket === key);
    const amountCents = inBucket.reduce((sum, c) => sum + (BigInt(c.netCents) - BigInt(c.paidCents)), 0n);
    return { key, label: DUE_DATE_BUCKET_LABELS[key], count: inBucket.length, amountCents: amountCents.toString() };
  });

  return { buckets, charges, receivedThisMonthCents: (monthPayments._sum.amountCents ?? 0n).toString() };
}
```

Remove the entire `getDashboardSummary` function (lines currently at the end of the file, shown in the codebase excerpt above) — its only caller is rewired to `getDueDateOverview` in Task 3.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test:integration -- src/features/charges/queries.integration.test.ts`
Expected: PASS, all 4 cases.

- [ ] **Step 6: Confirm no other caller of the removed function**

Run: `grep -rn "getDashboardSummary" src/`
Expected: no matches (Task 3 hasn't run yet in a fresh checkout, so if this plan is executed in order this will still show `src/app/(app)/page.tsx` — that's fine, Task 3 fixes it next; if it shows anything else, stop and report it before continuing).

- [ ] **Step 7: Commit**

```bash
git add src/lib/labels.ts src/features/charges/queries.ts src/features/charges/queries.integration.test.ts
git commit -m "feat(charges): add getDueDateOverview, replacing the 3-query dashboard summary"
```

---

### Task 3: `DueDateStrip` component, `DashboardPanel` rewrite, page wiring

**Files:**
- Create: `src/features/charges/components/due-date-strip.tsx`
- Modify: `src/features/charges/components/dashboard-panel.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `DueDateOverview`, `DueDateBucket` (Task 2/1). `ChargeDTO` (existing). `formatCents`, `formatLocalDate` from `@/lib/format` (already used in this file). `AppShell`, `OperatorAlerts`, `listOperatorAlerts`, `getSettings` — existing, unchanged imports.
- Produces: `DueDateStrip({ buckets, selected }: { buckets: DueDateOverview['buckets']; selected: DueDateBucket }): JSX.Element` (default export or named — match the existing named-export convention in this components folder, e.g. `export function DueDateStrip(...)`).

- [ ] **Step 1: Create the strip component**

```tsx
// src/features/charges/components/due-date-strip.tsx
import Link from 'next/link';
import { formatCents } from '@/lib/format';
import type { DueDateOverview } from '../queries';
import type { DueDateBucket } from '@/core/due-date-buckets';

const ZONE_STYLE: Record<DueDateBucket, string> = {
  'D-5': 'text-foreground-muted',
  'D-2': 'text-foreground-muted',
  D0: 'text-warning',
  'D+1': 'text-danger',
  'D+3': 'text-danger',
  'D+5': 'text-danger',
};

export function DueDateStrip({
  buckets,
  selected,
}: {
  buckets: DueDateOverview['buckets'];
  selected: DueDateBucket;
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded border border-border bg-surface">
      <div className="flex min-w-max">
        {buckets.map((bucket) => {
          const isSelected = bucket.key === selected;
          return (
            <Link
              key={bucket.key}
              href={`?bucket=${bucket.key}`}
              aria-current={isSelected ? 'true' : undefined}
              className={`flex min-w-[120px] flex-1 flex-col gap-1 border-r border-border p-4 last:border-r-0 ${
                isSelected ? 'bg-surface-raised' : 'hover:bg-surface-raised/50'
              }`}
            >
              <span className={`text-xs font-semibold uppercase tracking-wide ${ZONE_STYLE[bucket.key]}`}>
                {bucket.label}
              </span>
              <span className="font-mono text-lg font-bold tabular-mono text-foreground">{bucket.count}</span>
              <span className="font-mono text-xs tabular-mono text-foreground-muted">
                {formatCents(BigInt(bucket.amountCents))}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

Note: `text-warning`, `text-danger`, `border-border`, `bg-surface`, `bg-surface-raised` are the same design tokens already used elsewhere in `dashboard-panel.tsx` and `charge-status-badge.tsx` in this codebase — reuse them as-is, do not invent new token names.

- [ ] **Step 2: Rewrite `DashboardPanel`**

Replace the full contents of `src/features/charges/components/dashboard-panel.tsx`:

```tsx
import Link from 'next/link';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import { DueDateStrip } from './due-date-strip';
import type { ChargeDTO, DueDateOverview } from '../queries';
import type { DueDateBucket } from '@/core/due-date-buckets';

const PREVIEW_CAP = 20;
const OVERDUE_BUCKETS = new Set<DueDateBucket>(['D+1', 'D+3', 'D+5']);

function ChargeFilteredList({
  bucketLabel,
  rows,
  timezone,
  seeMoreHref,
}: {
  bucketLabel: string;
  rows: (ChargeDTO & { bucket: DueDateBucket })[];
  timezone: string;
  seeMoreHref: string;
}) {
  const preview = rows.slice(0, PREVIEW_CAP);
  return (
    <div className="rounded border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{bucketLabel}</p>
        {rows.length > PREVIEW_CAP && (
          <p className="text-xs text-foreground-muted">
            mostrando {PREVIEW_CAP} de {rows.length} —{' '}
            <Link href={seeMoreHref} className="text-brand hover:underline">
              ver todas
            </Link>
          </p>
        )}
      </div>
      {preview.length === 0 ? (
        <p className="py-2 text-sm text-foreground-muted">Nenhuma cobrança neste balde.</p>
      ) : (
        <ul>
          {preview.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <Link href={`/customers/${row.customerId}`} className="text-sm font-semibold text-foreground hover:text-brand">
                {row.customerName}
              </Link>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm tabular-mono text-foreground-muted">
                  {formatLocalDate(row.dueAt, timezone)}
                </span>
                <span className="font-mono text-sm tabular-mono text-foreground">
                  {formatCents(BigInt(row.netCents) - BigInt(row.paidCents))}
                </span>
                <ChargeStatusBadge status={row.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DashboardPanel({
  overview,
  selectedBucket,
  timezone,
}: {
  overview: DueDateOverview;
  selectedBucket: DueDateBucket;
  timezone: string;
}) {
  const selected = overview.buckets.find((b) => b.key === selectedBucket)!;
  const filteredCharges = overview.charges.filter((c) => c.bucket === selectedBucket);
  const seeMoreStatus = OVERDUE_BUCKETS.has(selectedBucket) ? 'OVERDUE' : 'OPEN';

  return (
    <div className="flex flex-col gap-6">
      <DueDateStrip buckets={overview.buckets} selected={selectedBucket} />
      <ChargeFilteredList
        bucketLabel={selected.label}
        rows={filteredCharges}
        timezone={timezone}
        seeMoreHref={`/charges?status=${seeMoreStatus}`}
      />
      <div className="rounded border border-border bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Recebido no mês</p>
        <p className="mt-1 font-mono text-xl font-bold tabular-mono text-foreground">
          {formatCents(BigInt(overview.receivedThisMonthCents))}
        </p>
      </div>
    </div>
  );
}
```

This deletes `SummaryCard` and the old `ChargePreviewList` (renamed/replaced by `ChargeFilteredList`, which adds the truncation notice) and the `CalendarClock`/`CalendarRange`/`AlertTriangle`/`Wallet` icon imports (no longer used — remove the `lucide-react` import line entirely if nothing else in the file uses those icons; confirm with `grep -n "lucide-react" src/features/charges/components/dashboard-panel.tsx` after the rewrite).

- [ ] **Step 3: Rewire the page**

Replace `src/app/(app)/page.tsx`:

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { getDueDateOverview } from '@/features/charges/queries';
import { getSettings } from '@/features/settings/queries';
import { DashboardPanel } from '@/features/charges/components/dashboard-panel';
import { listOperatorAlerts } from '@/features/dunning/queries';
import { OperatorAlerts } from '@/features/dunning/components/operator-alerts';
import { DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';

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
  const [overview, alerts] = await Promise.all([
    getDueDateOverview(now, settings.timezone),
    listOperatorAlerts(),
  ]);

  return (
    <AppShell title="Painel">
      <DashboardPanel overview={overview} selectedBucket={selectedBucket} timezone={settings.timezone} />
      <OperatorAlerts alerts={alerts} timezone={settings.timezone} />
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify the build and full test suite**

Run: `pnpm typecheck`
Expected: no errors.

Run: `pnpm lint`
Expected: no errors (fix any unused-import lint failures from the `dashboard-panel.tsx` rewrite — this is the most likely source, per Step 2's note about removing the `lucide-react` import).

Run: `pnpm test && pnpm test:integration`
Expected: full suite PASS, including Tasks 1 and 2's new tests.

Run: `pnpm build`
Expected: succeeds — confirms `page.tsx`'s `searchParams` typing and the component prop wiring are all correct.

- [ ] **Step 5: Commit**

```bash
git add src/features/charges/components/due-date-strip.tsx src/features/charges/components/dashboard-panel.tsx "src/app/(app)/page.tsx"
git commit -m "feat(dashboard): replace stat cards with clickable due-date strip

4 generic SummaryCards never matched the design handoff's due-date strip
concept (docs/projeto/design/02-handoff-painel.md). Filter now lives in
the URL (?bucket=D+1) instead of just linking out to /charges, so the
strip is real navigation, not decoration."
```

---

## What this plan deliberately does not cover

- `/charges` gains no date-range filter — the "ver todas" link uses the bucket's dominant status only, per spec.
- No new financial metrics on the dashboard (Faturado/Custo/Margem stay out — that's a future reports page, not this change).
- `OperatorAlerts` itself is unchanged, only reordered to render last.
- Mobile layout is handled by the strip's own `overflow-x-auto` — no separate mobile-specific component.
