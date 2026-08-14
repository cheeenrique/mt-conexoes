# Reajuste em Lote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a supplier's `unitCostCents` is raised, let the operator review and bulk-apply the impact — sync `costCents` and adjust `priceCents` (absolute markup preserved) — across every `ACTIVE` subscription tied to that supplier, in one confirmed action.

**Architecture:** A query computes a per-subscription preview (old/new cost, old/new price) purely from current DB state — no stored "pending adjustment," fully idempotent if re-opened later. A service function applies it inside one transaction, looping over affected subscriptions (bounded by supplier's customer count, never in the thousands at this project's scale). The UI reuses two existing shared components verbatim (`TypeToConfirmDialog` for the >100 confirmation, the same branching already used by manual message send) — no new confirmation pattern invented.

**Tech Stack:** Next.js App Router (Server Actions + Server Components), Prisma, Vitest.

## Global Constraints

- `Charge` rows are never modified — a document already emitted is immutable (`CLAUDE.md`). Only `Subscription.costCents`/`priceCents` (forward-looking) change.
- Money stays `BigInt` end to end; no `Number()` on a cents value.
- Bulk action above 100 rows requires typing the count to confirm (`.claude/rules/04-frontend.md`) — reuse `src/components/ui/type-to-confirm-dialog.tsx`, do not build a new confirmation component.
- Every Server Action starts with `requireSession()` (`.claude/rules/02-servidor.md`).
- `revalidatePath` happens after the transaction commits, never inside it.
- Only cost **increases** trigger anything. A decrease is a silent no-op (out of scope, per the design spec).

Source spec: `docs/superpowers/specs/2026-08-13-reajuste-em-lote-design.md`.

---

### Task 1: `listBulkAdjustPreview` query

**Files:**
- Modify: `src/features/suppliers/queries.ts`
- Create: `src/features/suppliers/queries.integration.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db` — already imported in this file.
- Produces: `export type BulkAdjustPreviewRow = { subscriptionId: string; customerName: string; oldCostCents: string; newCostCents: string; oldPriceCents: string; newPriceCents: string }`, `export async function listBulkAdjustPreview(supplierId: string): Promise<BulkAdjustPreviewRow[]>`.

- [ ] **Step 1: Write the failing integration test**

```ts
// src/features/suppliers/queries.integration.test.ts
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listBulkAdjustPreview } from './queries';

let supplierId: string;
let otherSupplierId: string;
let customerId: string;

async function createSubscription(opts: {
  priceCents: bigint;
  costCents: bigint;
  supplierId: string;
  status?: 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
}) {
  return db.subscription.create({
    data: {
      customerId,
      supplierId: opts.supplierId,
      priceCents: opts.priceCents,
      costCents: opts.costCents,
      cycle: 'MONTHLY',
      nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      status: opts.status ?? 'ACTIVE',
    },
  });
}

afterEach(async () => {
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.supplier.deleteMany({ where: { id: { in: [supplierId, otherSupplierId] } } });
});

describe('listBulkAdjustPreview', () => {
  it('previews cost/price deltas for active subscriptions of the given supplier only', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor A ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor B ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id;

    const active = await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId, status: 'SUSPENDED' });
    await createSubscription({ priceCents: 10_000n, costCents: 3_000n, supplierId: otherSupplierId });

    const preview = await listBulkAdjustPreview(supplierId);

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({
      subscriptionId: active.id,
      customerName: customer.name,
      oldCostCents: '3000',
      newCostCents: '4000',
      oldPriceCents: '10000',
      newPriceCents: '11000', // 10000 + (4000 - 3000)
    });
  });

  it('a subscription whose costCents already exceeds the new supplier cost gets a lower price, clamped at zero if it would go negative', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Reajuste ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor C ${randomUUID()}`, unitCostCents: 4_000n } });
    supplierId = supplier.id;
    const other = await db.supplier.create({ data: { name: `Fornecedor D ${randomUUID()}`, unitCostCents: 1_000n } });
    otherSupplierId = other.id; // unused by this test's assertions, created only so afterEach's cleanup shape stays the same across both tests

    await createSubscription({ priceCents: 500n, costCents: 6_000n, supplierId }); // already overridden above new cost

    const preview = await listBulkAdjustPreview(supplierId);

    expect(preview).toHaveLength(1);
    // delta = 4000 - 6000 = -2000; newPrice = 500 - 2000 = -1500 -> clamped to 0
    expect(preview[0].newPriceCents).toBe('0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration -- src/features/suppliers/queries.integration.test.ts`
Expected: FAIL — `listBulkAdjustPreview` is not exported yet.

- [ ] **Step 3: Implement**

Append to `src/features/suppliers/queries.ts`:

```ts
export type BulkAdjustPreviewRow = {
  subscriptionId: string;
  customerName: string;
  oldCostCents: string;
  newCostCents: string;
  oldPriceCents: string;
  newPriceCents: string;
};

export async function listBulkAdjustPreview(supplierId: string): Promise<BulkAdjustPreviewRow[]> {
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const subscriptions = await db.subscription.findMany({
    where: { supplierId, status: 'ACTIVE' },
    include: { customer: { select: { name: true } } },
  });

  return subscriptions.map((sub) => {
    const delta = supplier.unitCostCents - sub.costCents;
    const newPriceCents = sub.priceCents + delta;
    return {
      subscriptionId: sub.id,
      customerName: sub.customer.name,
      oldCostCents: sub.costCents.toString(),
      newCostCents: supplier.unitCostCents.toString(),
      oldPriceCents: sub.priceCents.toString(),
      newPriceCents: (newPriceCents < 0n ? 0n : newPriceCents).toString(),
    };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration -- src/features/suppliers/queries.integration.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/suppliers/queries.ts src/features/suppliers/queries.integration.test.ts
git commit -m "feat(suppliers): add listBulkAdjustPreview query"
```

---

### Task 2: `applyBulkPriceAdjustment` service

**Files:**
- Modify: `src/features/suppliers/service.ts`
- Create: `src/features/suppliers/service.integration.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db` — already imported.
- Produces: `export async function applyBulkPriceAdjustment(supplierId: string): Promise<{ count: number }>`.

- [ ] **Step 1: Write the failing integration tests**

```ts
// src/features/suppliers/service.integration.test.ts
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { applyBulkPriceAdjustment } from './service';

let supplierId: string;
let customerId: string;

afterEach(async () => {
  await db.payment.deleteMany({ where: { charge: { customerId } } });
  await db.charge.deleteMany({ where: { customerId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.supplier.deleteMany({ where: { id: supplierId } });
});

describe('applyBulkPriceAdjustment', () => {
  it('updates costCents and priceCents on every active subscription of the supplier, matching the preview formula', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Aplicar ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Aplicar ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId,
        priceCents: 12_000n, costCents: 3_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    const result = await applyBulkPriceAdjustment(supplierId);

    expect(result.count).toBe(1);
    const updated = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(updated.costCents).toBe(5_000n);
    expect(updated.priceCents).toBe(14_000n); // 12000 + (5000 - 3000)
  });

  it('never modifies an already-issued Charge — its principal, discount and cost stay frozen', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Congelado ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor Congelado ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId,
        priceCents: 12_000n, costCents: 3_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });
    const charge = await db.charge.create({
      data: {
        subscriptionId: sub.id, customerId, supplierId,
        principalCents: 12_000n, discountCents: 0n, costCents: 3_000n,
        periodStart: new Date('2026-08-13T00:00:00.000Z'),
        periodEnd: new Date('2026-09-12T00:00:00.000Z'),
        dueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    await applyBulkPriceAdjustment(supplierId);

    const untouchedCharge = await db.charge.findUniqueOrThrow({ where: { id: charge.id } });
    expect(untouchedCharge.principalCents).toBe(12_000n);
    expect(untouchedCharge.costCents).toBe(3_000n);
  });

  it('does not touch a subscription belonging to a different supplier', async () => {
    const customer = await db.customer.create({ data: { name: `Cliente Outro ${randomUUID()}` } });
    customerId = customer.id;
    const supplier = await db.supplier.create({ data: { name: `Fornecedor X ${randomUUID()}`, unitCostCents: 5_000n } });
    supplierId = supplier.id;
    const otherSupplier = await db.supplier.create({ data: { name: `Fornecedor Y ${randomUUID()}`, unitCostCents: 1_000n } });

    const sub = await db.subscription.create({
      data: {
        customerId, supplierId: otherSupplier.id,
        priceCents: 9_000n, costCents: 2_000n, cycle: 'MONTHLY',
        nextDueAt: new Date('2026-09-13T02:59:59.000Z'),
      },
    });

    const result = await applyBulkPriceAdjustment(supplierId);

    expect(result.count).toBe(0);
    const unchanged = await db.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    expect(unchanged.priceCents).toBe(9_000n);
    await db.subscription.delete({ where: { id: sub.id } });
    await db.supplier.delete({ where: { id: otherSupplier.id } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:integration -- src/features/suppliers/service.integration.test.ts`
Expected: FAIL — `applyBulkPriceAdjustment` is not exported yet.

- [ ] **Step 3: Implement**

Append to `src/features/suppliers/service.ts`:

```ts
export async function applyBulkPriceAdjustment(supplierId: string): Promise<{ count: number }> {
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const subscriptions = await tx.subscription.findMany({ where: { supplierId, status: 'ACTIVE' } });

    for (const sub of subscriptions) {
      const delta = supplier.unitCostCents - sub.costCents;
      const newPriceCents = sub.priceCents + delta;
      await tx.subscription.update({
        where: { id: sub.id },
        data: { costCents: supplier.unitCostCents, priceCents: newPriceCents < 0n ? 0n : newPriceCents },
      });
    }

    return { count: subscriptions.length };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:integration -- src/features/suppliers/service.integration.test.ts`
Expected: PASS, all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/suppliers/service.ts src/features/suppliers/service.integration.test.ts
git commit -m "feat(suppliers): add applyBulkPriceAdjustment, never touches issued charges"
```

---

### Task 3: Actions + `BulkAdjustDialog` + wire into `SupplierDrawer`

**Files:**
- Modify: `src/features/suppliers/actions.ts`
- Create: `src/features/suppliers/components/bulk-adjust-dialog.tsx`
- Modify: `src/features/suppliers/components/supplier-drawer.tsx`

**Interfaces:**
- Consumes: `listBulkAdjustPreview`, `type BulkAdjustPreviewRow` from `./queries` (Task 1). `applyBulkPriceAdjustment` from `./service` (Task 2). `TypeToConfirmDialog` from `@/components/ui/type-to-confirm-dialog` (existing, used as-is — same pattern as `send-message-dialog.tsx`). `formatCents` from `@/lib/format` (existing).
- Produces: `getBulkAdjustPreviewAction(supplierId: string)`, `applyBulkAdjustAction(supplierId: string)` in `actions.ts`. `BulkAdjustDialog({ open, onOpenChange, supplierId, rows }: { open: boolean; onOpenChange: (open: boolean) => void; supplierId: string; rows: BulkAdjustPreviewRow[] })` component.

- [ ] **Step 1: Add the two Server Actions**

Append to `src/features/suppliers/actions.ts` (the file already imports `requireSession`, `DomainError`, `logger`, `messages`, `revalidatePath` — reuse those same imports, add `listBulkAdjustPreview` and `applyBulkPriceAdjustment` to the existing import from `./queries` / new import from `./service`):

```ts
import { listBulkAdjustPreview } from './queries';
import { applyBulkPriceAdjustment } from './service';
```

```ts
export async function getBulkAdjustPreviewAction(supplierId: string) {
  try {
    await requireSession();
    const rows = await listBulkAdjustPreview(supplierId);
    return { ok: true as const, rows };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjustPreview', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function applyBulkAdjustAction(supplierId: string) {
  try {
    await requireSession();
    const result = await applyBulkPriceAdjustment(supplierId);
    revalidatePath('/suppliers');
    return { ok: true as const, count: result.count };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjust', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 2: Create `BulkAdjustDialog`**

```tsx
// src/features/suppliers/components/bulk-adjust-dialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { formatCents } from '@/lib/format';
import { applyBulkAdjustAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import type { BulkAdjustPreviewRow } from '../queries';

const BATCH_CONFIRM_THRESHOLD = 100;

export function BulkAdjustDialog({
  open,
  onOpenChange,
  supplierId,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  rows: BulkAdjustPreviewRow[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  async function apply() {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const result = await applyBulkAdjustAction(supplierId);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      toastSuccess(`Reajuste aplicado em ${result.count} assinatura(s).`);
      setConfirmOpen(false);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  }

  function handleConfirmClick() {
    if (rows.length > BATCH_CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    apply();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custo subiu — {rows.length} assinatura(s) afetada(s)</DialogTitle>
          </DialogHeader>
          <ul className="mt-2 max-h-80 overflow-y-auto text-sm">
            {rows.map((row) => (
              <li key={row.subscriptionId} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
                <span className="text-foreground">{row.customerName}</span>
                <span className="font-mono text-foreground-muted">
                  {formatCents(row.oldCostCents)} → {formatCents(row.newCostCents)}
                </span>
                <span className="font-mono text-foreground">
                  {formatCents(row.oldPriceCents)} → {formatCents(row.newPriceCents)}
                </span>
              </li>
            ))}
          </ul>
          <Button disabled={isApplying} onClick={handleConfirmClick}>
            {rows.length > BATCH_CONFIRM_THRESHOLD ? 'Continuar' : `Aplicar em ${rows.length} assinatura(s)`}
          </Button>
        </DialogContent>
      </Dialog>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar reajuste em lote"
        description={`Você está prestes a reajustar ${rows.length} assinaturas. Digite o número pra confirmar.`}
        expectedValue={rows.length}
        confirmLabel="Aplicar"
        onConfirm={apply}
      />
    </>
  );
}
```

- [ ] **Step 3: Wire into `SupplierDrawer`**

Modify `src/features/suppliers/components/supplier-drawer.tsx`. Add imports:

```tsx
import { useState } from 'react';
import { getBulkAdjustPreviewAction } from '../actions';
import { BulkAdjustDialog } from './bulk-adjust-dialog';
import type { BulkAdjustPreviewRow } from '../queries';
```

Add state and modify `onSubmit` (the function already exists in this file — extend it, don't replace the whole component):

```tsx
const [bulkRows, setBulkRows] = useState<BulkAdjustPreviewRow[] | null>(null);

async function onSubmit(values: FormValues) {
  const result = supplier
    ? await updateSupplierAction(supplier.id, values)
    : await createSupplierAction(values);

  if ('error' in result) {
    toastError(result.error);
    return;
  }
  toastSuccess(supplier ? messages.suppliers.updated : messages.suppliers.created);
  reset();
  onOpenChange(false);

  if (supplier && BigInt(values.unitCostCents) > BigInt(supplier.unitCostCents)) {
    const preview = await getBulkAdjustPreviewAction(supplier.id);
    if ('ok' in preview && preview.rows.length > 0) {
      setBulkRows(preview.rows);
    }
  }
}
```

Add the dialog to the JSX, right after the closing `</Dialog>` of the existing edit dialog (as a sibling, not nested inside it):

```tsx
{bulkRows && supplier && (
  <BulkAdjustDialog
    open={bulkRows.length > 0}
    onOpenChange={(open) => !open && setBulkRows(null)}
    supplierId={supplier.id}
    rows={bulkRows}
  />
)}
```

- [ ] **Step 4: Verify**

Run: `pnpm typecheck`
Expected: clean.

Run: `pnpm lint`
Expected: 0 errors.

Run: `pnpm test && pnpm test:integration`
Expected: full suite PASS, including Tasks 1 and 2's new tests, no regressions.

Run: `pnpm build`
Expected: succeeds (if it hits the known pre-existing Google Fonts/Turbopack issue in untouched `src/app/layout.tsx`, confirm via `git stash` before treating it as caused by this task).

- [ ] **Step 5: Commit**

```bash
git add src/features/suppliers/actions.ts src/features/suppliers/components/bulk-adjust-dialog.tsx src/features/suppliers/components/supplier-drawer.tsx
git commit -m "feat(suppliers): offer bulk price/cost adjustment when supplier cost rises

Supplier.unitCostCents going up never propagated to existing
subscriptions — operator had to edit each one by hand. Now the drawer
shows the real impact (per-subscription, list of who's affected) before
applying, same review-before-mutate pattern already used by the dunning
rule activation and manual message send."
```

---

## What this plan deliberately does not cover

- Cost decreasing — no trigger, no auto-adjustment downward.
- Any change to `Charge` — immutable, untouched by design.
- Customer-facing notification of the price change.
- A dedicated `/suppliers/[id]` page — this stays inside the existing drawer-based flow on `/suppliers`.
