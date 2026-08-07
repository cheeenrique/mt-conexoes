# Etapa 1a — Base (Settings/Supplier/Plan) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de `Settings` (singleton), `Supplier`, `Plan` — telas `/suppliers`, `/plans`, `/settings`, seguindo exatamente o padrão já estabelecido em `features/auth/` (schema Zod compartilhado, service orquestra, action fina, DataTable reusada, DomainError → toast/setError).

**Architecture:** Mesmas camadas da Etapa 0 (`app/ → features/ → core/, lib/`). Cada feature ganha `schema.ts` (Zod), `service.ts` (Prisma + regra), `queries.ts` (leitura, DTO com `BigInt`→`string`), `actions.ts` (Server Actions finas, `requireSession()` sempre primeiro).

**Tech Stack:** o mesmo da Etapa 0 — Next.js App Router, Prisma, react-hook-form + Zod, `CurrencyInput`/`DataTable`/`StatusBadge`/`EmptyState` já existentes.

## Global Constraints

- `BigInt` em centavos, sufixo `Cents`, nunca `number`/`float`. Conversão pra `string` acontece em `queries.ts`, nunca antes.
- Toda Server Action começa com `requireSession()`, valida com Zod (`safeParse`, nunca `.parse()` fora de `try`), erro mapeado via `DomainError` → `{ code, message }`.
- Toda mensagem pt-BR de usuário final vem de `lib/messages.ts`, nunca string solta em `actions.ts`.
- Filtro/paginação de lista em `searchParams`, nunca `useState`.
- Nenhuma exclusão real de `Supplier`/`Plan` — só toggle `isActive`.
- Rotas e pastas de feature em inglês (`/suppliers`, `/plans`, `/settings`, `features/suppliers/`) — decisão registrada no spec, `CLAUDE.md` corrigido nesta etapa. Texto visível ao usuário (labels, títulos) continua pt-BR.
- Componente `ui/` não conhece domínio; `CurrencyInput`/`DataTable`/`StatusBadge`/`EmptyState`/`ConfirmDialog` já existem em `src/components/ui/` — reusar, não recriar.
- `core/` puro: `marginPercent` de `src/core/money.ts` é chamado tanto no client (cálculo ao vivo no drawer) quanto no server (coluna da tabela) — mesma função, sem duplicar a fórmula.
- Commits: Conventional Commits, subject ≤72 chars — contar caracteres antes de usar qualquer mensagem sugerida.
- Orçamento de tamanho: Server Action ≤30 linhas, `service.ts` ≤250, componente React ≤150, `page.tsx` ≤100.

---

### Task 1: Migration — `BillingCycle`, `Settings`, `Supplier`, `Plan` + seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_settings_supplier_plan/migration.sql`
- Modify: `prisma/seed.ts`

**Interfaces:**
- Produces: Prisma models `Settings`, `Supplier`, `Plan`, enum `BillingCycle` — every later task in this plan imports the generated Prisma Client types for these.

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Append after the existing `LoginAttempt` model:

```prisma
enum BillingCycle {
  MONTHLY
  QUARTERLY
  SEMIANNUAL
  ANNUAL
}

model Settings {
  id                 String   @id @default("singleton")
  businessName       String
  timezone           String   @default("America/Sao_Paulo")
  quietHourStart     Int      @default(8)
  quietHourEnd       Int      @default(20)
  sendingPaused      Boolean  @default(false)
  pixKey             String?
  pixHolderName      String?
  marginAlertPercent Decimal  @default(30) @db.Decimal(5, 2)
  updatedAt          DateTime @updatedAt

  @@map("settings")
}

model Supplier {
  id            String   @id @default(uuid(7))
  name          String   @unique
  unitCostCents BigInt   @default(0)
  notes         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())

  plans         Plan[]

  @@map("suppliers")
}

model Plan {
  id         String       @id @default(uuid(7))
  name       String       @unique
  priceCents BigInt       @default(0)
  costCents  BigInt       @default(0)
  cycle      BillingCycle @default(MONTHLY)
  supplierId String?
  isActive   Boolean      @default(true)
  createdAt  DateTime     @default(now())

  supplier   Supplier?    @relation(fields: [supplierId], references: [id])

  @@map("plans")
}
```

- [ ] **Step 2: Create the migration folder and SQL**

```bash
mkdir -p prisma/migrations/00000000000001_add_settings_supplier_plan
```

`prisma/migrations/00000000000001_add_settings_supplier_plan/migration.sql`:

```sql
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

CREATE TABLE "settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "businessName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "quietHourStart" INTEGER NOT NULL DEFAULT 8,
    "quietHourEnd" INTEGER NOT NULL DEFAULT 20,
    "sendingPaused" BOOLEAN NOT NULL DEFAULT false,
    "pixKey" TEXT,
    "pixHolderName" TEXT,
    "marginAlertPercent" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "settings_singleton_check" CHECK ("id" = 'singleton')
);

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitCostCents" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "suppliers_name_key" ON "suppliers"("name");

CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" BIGINT NOT NULL DEFAULT 0,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "supplierId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

ALTER TABLE "plans" ADD CONSTRAINT "plans_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply and generate**

```bash
docker compose up -d db
pnpm db:migrate
pnpm dlx prisma generate
```

Expected: `1 migration found... Applied`, Prisma Client regenerated with `Settings`/`Supplier`/`Plan`/`BillingCycle` types.

- [ ] **Step 4: Extend `prisma/seed.ts` to also seed `Settings`**

Read the current file first — it has a `main()` function seeding `User`. Add a `Settings` upsert inside the same `main()`, after the user block, before `db.$disconnect()`:

```ts
  const settings = await db.settings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton', businessName: 'MT Conexões' },
  });
  console.log(`[seed] settings pronto: ${settings.businessName}`);
```

(Idempotent — `upsert` with an empty `update` leaves an existing row untouched, matching the same "don't reset what's already configured" principle the `User` seed already follows.)

- [ ] **Step 5: Verify**

```bash
pnpm db:seed
docker exec mt-conexoes-db psql -U mtconexoes -d mtconexoes -c "select id, business_name, timezone from settings;"
```

Expected: `[seed] settings pronto: MT Conexões` printed, and the query returns one row. Note: `@@map` isn't set on `Settings`, so the actual column names follow Prisma's default (camelCase, unmapped) — adjust the verification query's column names if the model doesn't have `@@map("settings")` applied to columns (it only maps the table name). Run `\d settings` in psql first if the query above errors on column names.

- [ ] **Step 6: Run full gate and commit**

```bash
pnpm typecheck && pnpm build
```

```bash
git add prisma
git commit -m "feat(db): add Settings, Supplier, Plan models and seed Settings"
```

---

### Task 2: `features/suppliers` — schema, service, queries, actions

**Files:**
- Create: `src/features/suppliers/schema.ts`
- Create: `src/features/suppliers/service.ts`
- Create: `src/features/suppliers/queries.ts`
- Create: `src/features/suppliers/actions.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `DomainError` (`@/lib/errors`), `messages` (`@/lib/messages`), `logger` (`@/lib/logger`), `requireSession` (`@/features/auth/service`).
- Produces: `supplierSchema` (Zod), `SupplierDTO { id: string; name: string; unitCostCents: string; notes: string | null; isActive: boolean }`, `listSuppliers(params: { page: number; perPage: 8|12|20; onlyActive?: boolean }): Promise<{ rows: SupplierDTO[]; total: number }>`, `listActiveSuppliersForSelect(): Promise<{ id: string; name: string }[]>`, `createSupplierAction(input: unknown)`, `updateSupplierAction(id: string, input: unknown)` — Task 3 (components) and Task 5 (Plan's supplier select) depend on these exact names.

- [ ] **Step 1: `src/features/suppliers/schema.ts`**

```ts
import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'Informe o nome do fornecedor.'),
  unitCostCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});
```

- [ ] **Step 2: `src/features/suppliers/service.ts`**

```ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import type { z } from 'zod';
import type { supplierSchema } from './schema';

type SupplierInput = z.infer<typeof supplierSchema>;

export class SupplierNameTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um fornecedor com esse nome.', 'SUPPLIER_NAME_TAKEN', { cause });
  }
}

export async function createSupplier(input: SupplierInput) {
  try {
    return await db.supplier.create({
      data: {
        name: input.name,
        unitCostCents: BigInt(input.unitCostCents),
        notes: input.notes || null,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SupplierNameTakenError(err);
    throw err;
  }
}

export async function updateSupplier(id: string, input: SupplierInput) {
  try {
    return await db.supplier.update({
      where: { id },
      data: {
        name: input.name,
        unitCostCents: BigInt(input.unitCostCents),
        notes: input.notes || null,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SupplierNameTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
```

- [ ] **Step 3: `src/features/suppliers/queries.ts`**

```ts
import { db } from '@/lib/db';

export interface SupplierDTO {
  id: string;
  name: string;
  unitCostCents: string;
  notes: string | null;
  isActive: boolean;
}

function toDTO(row: {
  id: string;
  name: string;
  unitCostCents: bigint;
  notes: string | null;
  isActive: boolean;
}): SupplierDTO {
  return { ...row, unitCostCents: row.unitCostCents.toString() };
}

export async function listSuppliers(params: {
  page: number;
  perPage: 8 | 12 | 20;
}): Promise<{ rows: SupplierDTO[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    db.supplier.count(),
  ]);
  return { rows: rows.map(toDTO), total };
}

export async function getSupplier(id: string): Promise<SupplierDTO | null> {
  const row = await db.supplier.findUnique({ where: { id } });
  return row ? toDTO(row) : null;
}

export async function listActiveSuppliersForSelect(): Promise<{ id: string; name: string }[]> {
  return db.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
```

- [ ] **Step 4: `src/features/suppliers/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { supplierSchema } from './schema';
import { createSupplier, updateSupplier } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createSupplierAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await createSupplier(parsed.data);
    revalidatePath('/suppliers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateSupplierAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await updateSupplier(id, parsed.data);
    revalidatePath('/suppliers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 5: Add `messages.common.invalidInput` (shared across features, promoting from `messages.auth.invalidInput`)**

Read `src/lib/messages.ts` first. Add a `common.invalidInput` entry and keep `auth.invalidInput` as-is (don't touch `features/auth` in this plan — out of scope):

```ts
export const messages = {
  common: {
    unexpectedError: 'Algo deu errado. Tente de novo em instantes.',
    invalidInput: 'Dados inválidos.',
  },
  auth: {
    // ...unchanged
  },
  suppliers: {
    created: 'Fornecedor cadastrado.',
    updated: 'Fornecedor atualizado.',
  },
  plans: {
    created: 'Plano cadastrado.',
    updated: 'Plano atualizado.',
  },
} as const;
```

- [ ] **Step 6: Verify**

```bash
pnpm typecheck && pnpm build
```

Expected: clean (no consumers of these modules exist yet, so build just needs the types to check out).

- [ ] **Step 7: Commit**

```bash
git add src/features/suppliers src/lib/messages.ts
git commit -m "feat(suppliers): add schema, service, queries, actions"
```

---

### Task 3: `features/suppliers` — components + `/suppliers` page

**Files:**
- Create: `src/features/suppliers/components/supplier-table.tsx`
- Create: `src/features/suppliers/components/supplier-drawer.tsx`
- Create: `src/app/(app)/suppliers/page.tsx`

**Interfaces:**
- Consumes: `listSuppliers`/`SupplierDTO` (Task 2), `createSupplierAction`/`updateSupplierAction` (Task 2), `DataTable`/`CurrencyInput`/`StatusBadge`/`EmptyState`/`AppShell` (Etapa 0), `formatCents` (`@/lib/format`).
- Produces: `<SupplierTable rows={SupplierDTO[]} total={number} page={number} perPage={8|12|20} />` (client component managing its own drawer-open state), the `/suppliers` route.

- [ ] **Step 1: `src/features/suppliers/components/supplier-drawer.tsx`**

```tsx
'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { supplierSchema } from '../schema';
import { createSupplierAction, updateSupplierAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SupplierDTO } from '../queries';

type FormValues = z.infer<typeof supplierSchema>;

export function SupplierDrawer({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierDTO | null;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(supplierSchema),
    values: supplier
      ? { name: supplier.name, unitCostCents: supplier.unitCostCents, notes: supplier.notes ?? '', isActive: supplier.isActive }
      : { name: '', unitCostCents: '0', notes: '', isActive: true },
  });

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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] bg-surface">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="unitCostCents">Custo padrão por ciclo</Label>
            <Controller
              control={control}
              name="unitCostCents"
              render={({ field }) => (
                <CurrencyInput id="unitCostCents" value={field.value} onValueChange={field.onChange} />
              )}
            />
            {errors.unitCostCents && <p className="mt-1 text-sm text-danger">{errors.unitCostCents.message}</p>}
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              {...register('notes')}
              className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
            />
          </div>
          {supplier && (
            <p className="text-xs text-foreground-muted">
              Mudar o custo não reajusta assinatura existente sozinho.
            </p>
          )}
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`CurrencyInput` is a controlled component (`value`/`onValueChange`), so its field uses RHF's `Controller` (as written above) instead of `register` — every other text field in this form uses `register` as usual.

- [ ] **Step 2: `src/features/suppliers/components/supplier-table.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Truck } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { SupplierDrawer } from './supplier-drawer';
import type { SupplierDTO } from '../queries';

export function SupplierTable({
  rows,
  total,
  page,
  perPage,
}: {
  rows: SupplierDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<SupplierDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/suppliers?${params.toString()}`);
  }

  const columns: Column<SupplierDTO>[] = [
    { header: 'Fornecedor', cell: (row) => row.name },
    { header: 'Custo padrão por ciclo', align: 'right', cell: (row) => formatCents(row.unitCostCents) },
    { header: 'Assinaturas ativas', align: 'right', cell: () => '0' },
    { header: 'Margem média', align: 'right', cell: () => '—' },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar fornecedor"
          title="Editar fornecedor"
          onClick={() => {
            setEditing(row);
            setDrawerOpen(true);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={(p) => setParam('page', String(p))}
        onPerPageChange={(pp) => setParam('perPage', String(pp))}
        emptyState={
          <EmptyState
            icon={Truck}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre o fornecedor que fornece os créditos revendidos."
            action={
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                Cadastrar o primeiro
              </Button>
            }
          />
        }
      />
      <SupplierDrawer open={drawerOpen} onOpenChange={setDrawerOpen} supplier={editing} />
    </>
  );
}
```

- [ ] **Step 3: `src/features/suppliers/components/new-supplier-button.tsx`**

`page.tsx` is a Server Component, so the header's "Novo fornecedor" button (which needs to open the drawer on click) lives in its own small client wrapper:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SupplierDrawer } from './supplier-drawer';

export function NewSupplierButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo fornecedor</Button>
      <SupplierDrawer open={open} onOpenChange={setOpen} supplier={null} />
    </>
  );
}
```

- [ ] **Step 4: `src/app/(app)/suppliers/page.tsx`**

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { listSuppliers } from '@/features/suppliers/queries';
import { SupplierTable } from '@/features/suppliers/components/supplier-table';
import { NewSupplierButton } from '@/features/suppliers/components/new-supplier-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;

  const { rows, total } = await listSuppliers({ page, perPage });

  return (
    <AppShell title="Fornecedores" primaryAction={<NewSupplierButton />}>
      <SupplierTable rows={rows} total={total} page={page} perPage={perPage} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify**

```bash
docker compose up -d db
pnpm typecheck && pnpm build
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/suppliers  # expect 307 (redirect to /login, no session)
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add src/features/suppliers src/app/\(app\)/suppliers
git commit -m "feat(suppliers): add table, drawer, and /suppliers page"
```

---

### Task 4: `features/plans` — schema, service, queries, actions

**Files:**
- Create: `src/features/plans/schema.ts`
- Create: `src/features/plans/service.ts`
- Create: `src/features/plans/queries.ts`
- Create: `src/features/plans/actions.ts`

**Interfaces:**
- Consumes: `db`, `DomainError`, `messages`, `logger`, `requireSession`, `listActiveSuppliersForSelect` (Task 2).
- Produces: `planSchema`, `PlanDTO { id; name; priceCents: string; costCents: string; cycle: BillingCycle; supplierId: string | null; supplierName: string | null; isActive: boolean }`, `listPlans(...)`, `createPlanAction`, `updatePlanAction` — Task 5 depends on these.

- [ ] **Step 1: `src/features/plans/schema.ts`**

```ts
import { z } from 'zod';

export const CYCLE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
] as const;

export const planSchema = z.object({
  name: z.string().min(1, 'Informe o nome do plano.'),
  priceCents: z.string().regex(/^\d+$/, 'Preço inválido.'),
  costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL']),
  supplierId: z.string().uuid().optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});
```

- [ ] **Step 2: `src/features/plans/service.ts`**

```ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import type { z } from 'zod';
import type { planSchema } from './schema';

type PlanInput = z.infer<typeof planSchema>;

export class PlanNameTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um plano com esse nome.', 'PLAN_NAME_TAKEN', { cause });
  }
}

function toData(input: PlanInput) {
  return {
    name: input.name,
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    supplierId: input.supplierId || null,
    isActive: input.isActive,
  };
}

export async function createPlan(input: PlanInput) {
  try {
    return await db.plan.create({ data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PlanNameTakenError(err);
    throw err;
  }
}

export async function updatePlan(id: string, input: PlanInput) {
  try {
    return await db.plan.update({ where: { id }, data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PlanNameTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
```

- [ ] **Step 3: `src/features/plans/queries.ts`**

```ts
import { db } from '@/lib/db';
import type { BillingCycle } from '@prisma/client';

export interface PlanDTO {
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  supplierId: string | null;
  supplierName: string | null;
  isActive: boolean;
}

export async function listPlans(params: {
  page: number;
  perPage: 8 | 12 | 20;
}): Promise<{ rows: PlanDTO[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.plan.findMany({
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: { supplier: { select: { name: true } } },
    }),
    db.plan.count(),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      priceCents: row.priceCents.toString(),
      costCents: row.costCents.toString(),
      cycle: row.cycle,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? null,
      isActive: row.isActive,
    })),
    total,
  };
}

export async function getPlan(id: string): Promise<PlanDTO | null> {
  const row = await db.plan.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    isActive: row.isActive,
  };
}
```

- [ ] **Step 4: `src/features/plans/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { planSchema } from './schema';
import { createPlan, updatePlan } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createPlanAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await createPlan(parsed.data);
    revalidatePath('/plans');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'plans.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updatePlanAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = planSchema.safeParse(input);
    if (!parsed.success) return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };

    await updatePlan(id, parsed.data);
    revalidatePath('/plans');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'plans.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/plans
git commit -m "feat(plans): add schema, service, queries, actions"
```

---

### Task 5: `features/plans` — components + `/plans` page (with live margin calc)

**Files:**
- Create: `src/features/plans/components/plan-table.tsx`
- Create: `src/features/plans/components/plan-drawer.tsx`
- Create: `src/features/plans/components/new-plan-button.tsx`
- Create: `src/app/(app)/plans/page.tsx`

**Interfaces:**
- Consumes: `listPlans`/`PlanDTO`/`createPlanAction`/`updatePlanAction` (Task 4), `CYCLE_OPTIONS`/`planSchema` (Task 4), `listActiveSuppliersForSelect` (Task 2), `marginPercent` (`@/core/money`), `StatusBadge`, `formatCents`.

- [ ] **Step 1: `src/features/plans/components/plan-drawer.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { planSchema, CYCLE_OPTIONS } from '../schema';
import { createPlanAction, updatePlanAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { PlanDTO } from '../queries';

type FormValues = z.infer<typeof planSchema>;

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

export function PlanDrawer({
  open,
  onOpenChange,
  plan,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDTO | null;
  suppliers: { id: string; name: string }[];
}) {
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(planSchema),
    values: plan
      ? { name: plan.name, priceCents: plan.priceCents, costCents: plan.costCents, cycle: plan.cycle, supplierId: plan.supplierId ?? '', isActive: plan.isActive }
      : { name: '', priceCents: '0', costCents: '0', cycle: 'MONTHLY', supplierId: '', isActive: true },
  });

  const [liveMargin, setLiveMargin] = useState<Decimal | null>(null);
  const priceCents = watch('priceCents');
  const costCents = watch('costCents');

  useEffect(() => {
    try {
      setLiveMargin(marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0')));
    } catch {
      setLiveMargin(null);
    }
  }, [priceCents, costCents]);

  async function onSubmit(values: FormValues) {
    const result = plan ? await updatePlanAction(plan.id, values) : await createPlanAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(plan ? messages.plans.updated : messages.plans.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] bg-surface">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar plano' : 'Novo plano'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="cycle">Ciclo</Label>
            <select id="cycle" {...register('cycle')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              {CYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priceCents">Preço</Label>
            <Controller control={control} name="priceCents" render={({ field }) => (
              <CurrencyInput id="priceCents" value={field.value} onValueChange={field.onChange} />
            )} />
          </div>
          <div>
            <Label htmlFor="costCents">Custo padrão</Label>
            <Controller control={control} name="costCents" render={({ field }) => (
              <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
            )} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Margem:</span>
            <StatusBadge tone={marginTone(liveMargin)}>
              {liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}
            </StatusBadge>
          </div>
          <div>
            <Label htmlFor="supplierId">Fornecedor padrão</Label>
            <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {plan && (
            <p className="text-xs text-foreground-muted">Mudar o preço não reajusta assinatura existente.</p>
          )}
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: `src/features/plans/components/plan-table.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Layers } from 'lucide-react';
import Decimal from 'decimal.js';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { CYCLE_OPTIONS } from '../schema';
import { PlanDrawer } from './plan-drawer';
import type { PlanDTO } from '../queries';

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

function cycleLabel(cycle: string): string {
  return CYCLE_OPTIONS.find((opt) => opt.value === cycle)?.label ?? cycle;
}

export function PlanTable({
  rows,
  total,
  page,
  perPage,
  suppliers,
}: {
  rows: PlanDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<PlanDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/plans?${params.toString()}`);
  }

  const columns: Column<PlanDTO>[] = [
    { header: 'Plano', cell: (row) => row.name },
    { header: 'Ciclo', cell: (row) => cycleLabel(row.cycle) },
    { header: 'Preço', align: 'right', cell: (row) => formatCents(row.priceCents) },
    { header: 'Custo', align: 'right', cell: (row) => formatCents(row.costCents) },
    {
      header: 'Margem',
      align: 'right',
      cell: (row) => {
        const pct = marginPercent(BigInt(row.priceCents), BigInt(row.costCents));
        return <StatusBadge tone={marginTone(pct)}>{pct === null ? '—' : `${pct.toFixed(1)}%`}</StatusBadge>;
      },
    },
    { header: 'Assinaturas ativas', align: 'right', cell: () => '0' },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar plano"
          title="Editar plano"
          onClick={() => { setEditing(row); setDrawerOpen(true); }}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={(p) => setParam('page', String(p))}
        onPerPageChange={(pp) => setParam('perPage', String(pp))}
        emptyState={
          <EmptyState
            icon={Layers}
            title="Nenhum plano cadastrado"
            description="Cadastre os pacotes comerciais vendidos aos clientes."
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Cadastrar o primeiro</Button>}
          />
        }
      />
      <PlanDrawer open={drawerOpen} onOpenChange={setDrawerOpen} plan={editing} suppliers={suppliers} />
    </>
  );
}
```

- [ ] **Step 3: `src/features/plans/components/new-plan-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlanDrawer } from './plan-drawer';

export function NewPlanButton({ suppliers }: { suppliers: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo plano</Button>
      <PlanDrawer open={open} onOpenChange={setOpen} plan={null} suppliers={suppliers} />
    </>
  );
}
```

- [ ] **Step 4: `src/app/(app)/plans/page.tsx`**

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { listPlans } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { PlanTable } from '@/features/plans/components/plan-table';
import { NewPlanButton } from '@/features/plans/components/new-plan-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;

  const [{ rows, total }, suppliers] = await Promise.all([
    listPlans({ page, perPage }),
    listActiveSuppliersForSelect(),
  ]);

  return (
    <AppShell title="Planos" primaryAction={<NewPlanButton suppliers={suppliers} />}>
      <PlanTable rows={rows} total={total} page={page} perPage={perPage} suppliers={suppliers} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/plans src/app/\(app\)/plans
git commit -m "feat(plans): add table, drawer with live margin calc, and page"
```

---

### Task 6: `features/settings` — schema, service, queries, actions

**Files:**
- Create: `src/features/settings/schema.ts`
- Create: `src/features/settings/service.ts`
- Create: `src/features/settings/queries.ts`
- Create: `src/features/settings/actions.ts`

**Interfaces:**
- Produces: `settingsSchema`, `SettingsDTO { businessName; timezone; quietHourStart; quietHourEnd; pixKey: string | null; pixHolderName: string | null; marginAlertPercent: string }`, `getSettings(): Promise<SettingsDTO>`, `updateSettingsAction(input: unknown)` — Task 7 depends on these.

- [ ] **Step 1: `src/features/settings/schema.ts`**

```ts
import { z } from 'zod';

export const settingsSchema = z
  .object({
    businessName: z.string().min(1, 'Informe o nome do negócio.'),
    timezone: z.string().min(1),
    quietHourStart: z.number().int().min(0).max(23),
    quietHourEnd: z.number().int().min(0).max(23),
    pixKey: z.string().optional(),
    pixHolderName: z.string().optional(),
    marginAlertPercent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Percentual inválido.'),
  })
  .refine((data) => data.quietHourStart < data.quietHourEnd, {
    message: 'O início precisa ser antes do fim.',
    path: ['quietHourEnd'],
  });
```

- [ ] **Step 2: `src/features/settings/service.ts`**

```ts
import { db } from '@/lib/db';
import type { z } from 'zod';
import type { settingsSchema } from './schema';

type SettingsInput = z.infer<typeof settingsSchema>;

export async function updateSettings(input: SettingsInput) {
  return db.settings.update({
    where: { id: 'singleton' },
    data: {
      businessName: input.businessName,
      timezone: input.timezone,
      quietHourStart: input.quietHourStart,
      quietHourEnd: input.quietHourEnd,
      pixKey: input.pixKey || null,
      pixHolderName: input.pixHolderName || null,
      marginAlertPercent: input.marginAlertPercent,
    },
  });
}
```

- [ ] **Step 3: `src/features/settings/queries.ts`**

```ts
import { db } from '@/lib/db';

export interface SettingsDTO {
  businessName: string;
  timezone: string;
  quietHourStart: number;
  quietHourEnd: number;
  pixKey: string | null;
  pixHolderName: string | null;
  marginAlertPercent: string;
}

export async function getSettings(): Promise<SettingsDTO> {
  const row = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  return {
    businessName: row.businessName,
    timezone: row.timezone,
    quietHourStart: row.quietHourStart,
    quietHourEnd: row.quietHourEnd,
    pixKey: row.pixKey,
    pixHolderName: row.pixHolderName,
    marginAlertPercent: row.marginAlertPercent.toString(),
  };
}
```

`findUniqueOrThrow` is intentional: the singleton row is guaranteed by the seed (Task 1). If it's ever missing, that's a deployment bug worth a loud 500, not a silent fallback.

- [ ] **Step 4: `src/features/settings/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { settingsSchema } from './schema';
import { updateSettings } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function updateSettingsAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = settingsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateSettings(parsed.data);
    revalidatePath('/settings');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'settings.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 5: Add `messages.settings.saved`**

```ts
  settings: {
    saved: 'Alterações salvas.',
  },
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/settings src/lib/messages.ts
git commit -m "feat(settings): add schema, service, queries, actions"
```

---

### Task 7: `features/settings` — form (2 tabs) + `/settings` page

**Files:**
- Create: `src/features/settings/components/settings-form.tsx`
- Create: `src/features/settings/components/channels-tab.tsx`
- Create: `src/app/(app)/settings/page.tsx`

**Interfaces:**
- Consumes: `getSettings`/`SettingsDTO`/`updateSettingsAction`/`settingsSchema` (Task 6).

- [ ] **Step 1: `src/features/settings/components/settings-form.tsx`**

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settingsSchema } from '../schema';
import { updateSettingsAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SettingsDTO } from '../queries';

type FormValues = z.infer<typeof settingsSchema>;

export function SettingsForm({ initial }: { initial: SettingsDTO }) {
  const defaultValues: FormValues = {
    businessName: initial.businessName,
    timezone: initial.timezone,
    quietHourStart: initial.quietHourStart,
    quietHourEnd: initial.quietHourEnd,
    pixKey: initial.pixKey ?? '',
    pixHolderName: initial.pixHolderName ?? '',
    marginAlertPercent: initial.marginAlertPercent,
  };

  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  const [savedSnapshot, setSavedSnapshot] = useState(defaultValues);
  const current = watch();
  const dirty = JSON.stringify(current) !== JSON.stringify(savedSnapshot);

  async function onSubmit(values: FormValues) {
    const result = await updateSettingsAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.settings.saved);
    setSavedSnapshot(values);
  }

  const pixKey = watch('pixKey');
  const pixHolderName = watch('pixHolderName');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6 pb-20">
      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Identificação</h2>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="businessName">Nome do negócio</Label>
            <Input id="businessName" aria-invalid={!!errors.businessName} {...register('businessName')} className="h-11" />
            {errors.businessName && <p className="mt-1 text-sm text-danger">{errors.businessName.message}</p>}
          </div>
          <div>
            <Label htmlFor="timezone">Fuso horário</Label>
            <select id="timezone" {...register('timezone')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="America/Sao_Paulo">América/São Paulo</option>
              <option value="America/Manaus">América/Manaus</option>
              <option value="America/Rio_Branco">América/Rio Branco</option>
            </select>
          </div>
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Recebimento</h2>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="pixKey">Chave Pix</Label>
            <Input id="pixKey" {...register('pixKey')} className="h-11" />
          </div>
          <div>
            <Label htmlFor="pixHolderName">Titular</Label>
            <Input id="pixHolderName" {...register('pixHolderName')} className="h-11" />
          </div>
          {pixKey && pixHolderName && (
            <p className="text-xs text-foreground-muted">Pix {pixKey} em nome de {pixHolderName}</p>
          )}
        </div>
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-foreground-muted">Envio e alertas</h2>
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="quietHourStart">Envia a partir de</Label>
              <Input id="quietHourStart" type="number" min={0} max={23} {...register('quietHourStart', { valueAsNumber: true })} className="h-11" />
            </div>
            <div className="flex-1">
              <Label htmlFor="quietHourEnd">Para de enviar às</Label>
              <Input id="quietHourEnd" type="number" min={0} max={23} {...register('quietHourEnd', { valueAsNumber: true })} className="h-11" />
              {errors.quietHourEnd && <p className="mt-1 text-sm text-danger">{errors.quietHourEnd.message}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="marginAlertPercent">Alertar margem abaixo de (%)</Label>
            <Input id="marginAlertPercent" {...register('marginAlertPercent')} className="h-11" />
          </div>
          <p className="text-xs text-foreground-muted">
            Mensagem calculada fora da janela sai no primeiro horário permitido. O alerta de margem não bloqueia venda.
          </p>
        </div>
      </section>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 flex items-center justify-between border-t-2 border-brand bg-surface px-6 py-3">
          <span className="text-sm text-foreground">Alterações ainda não salvas</span>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => reset(savedSnapshot)}>Descartar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 2: `src/features/settings/components/channels-tab.tsx`**

```tsx
const CHANNELS = [
  { name: 'Meta Cloud API', type: 'oficial' },
  { name: 'Evolution API', type: 'não oficial, servidor próprio' },
  { name: 'Salvy', type: 'não oficial, nuvem' },
];

export function ChannelsTab() {
  return (
    <div className="flex flex-col gap-3">
      {CHANNELS.map((channel) => (
        <div
          key={channel.name}
          className="grid items-center gap-4 rounded border border-border bg-surface px-4 py-3.5"
          style={{ gridTemplateColumns: 'minmax(0,1fr) 132px 200px 236px' }}
        >
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <div>
              <p className="text-sm font-bold text-foreground">{channel.name}</p>
              <p className="text-xs text-foreground-muted">{channel.type}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-foreground-muted">Situação</p>
            <span className="text-xs font-bold text-foreground-muted">Não configurado</span>
          </div>
          <div />
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              title="Disponível na Etapa 3"
              className="h-9 rounded-sm border border-border px-3 text-xs font-semibold text-foreground-muted opacity-50"
            >
              Configurar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: `src/app/(app)/settings/page.tsx`**

```tsx
import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/features/settings/queries';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { ChannelsTab } from '@/features/settings/components/channels-tab';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const aba = params.aba === 'canais' ? 'canais' : 'negocio';
  const settings = await getSettings();

  return (
    <AppShell title="Ajustes">
      <div className="mb-4 flex gap-2">
        <Link
          href="/settings?aba=negocio"
          className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === 'negocio' ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
        >
          Negócio
        </Link>
        <Link
          href="/settings?aba=canais"
          className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === 'canais' ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
        >
          Canais de WhatsApp
        </Link>
      </div>
      {aba === 'negocio' ? <SettingsForm initial={settings} /> : <ChannelsTab />}
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/settings src/app/\(app\)/settings
git commit -m "feat(settings): add tabbed form with unsaved-changes bar and page"
```

---

### Task 8: Sidebar routes → English + `CLAUDE.md` convention fix

**Files:**
- Modify: `src/components/layout/sidebar.tsx`
- Modify: `CLAUDE.md`

**Interfaces:** none new — pure rename/doc fix.

- [ ] **Step 1: Update `MENU_ITEMS` hrefs in `src/components/layout/sidebar.tsx`**

Change `href: '/fornecedores'` → `href: '/suppliers'`, `href: '/planos'` → `href: '/plans'`, `href: '/ajustes'` → `href: '/settings'`. Keep every `label` unchanged (still pt-BR: "Fornecedores", "Planos", "Ajustes"). Leave the other menu items (`/clientes`, `/cobrancas`, etc.) untouched — they don't have routes yet, and renaming them isn't this plan's scope (do it when their sub-project lands, per the spec's "não é retroativo" decision).

- [ ] **Step 2: Fix `CLAUDE.md`'s convention table**

Read the file first — find the line `| Rotas da UI | pt-BR, plural | \`/clientes/:id\`, \`/cobrancas\` |` and replace with:

```
| Rotas da UI | inglês, plural | `/suppliers`, `/plans`, `/settings` |
```

- [ ] **Step 3: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/components/layout/sidebar.tsx CLAUDE.md
git commit -m "refactor(nav): switch suppliers/plans/settings routes to English"
```

---

### Task 9: Final verification pass

**Files:** none created — this task only runs checks.

- [ ] **Step 1: Full gate**

```bash
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm test
pnpm test:integration
pnpm typecheck && pnpm lint && pnpm build
```

Expected: all green. No `core/`/`lib/` module in this plan required new unit tests per `.claude/rules/06-testes.md` (CRUD/tela não exige TDD) — but confirm the Etapa 0 suite (58 tests) still passes untouched.

- [ ] **Step 2: Manual end-to-end smoke check**

```bash
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/suppliers  # 307 (no session)
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/plans      # 307
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/settings   # 307
kill %1
```

Expected: all three `307` (middleware redirects to `/login`), confirming the routes exist and are guarded.

- [ ] **Step 3: Update `docs/projeto/tecnico/07-plano-de-entrega.md`**

Check off the Etapa 1 items genuinely done: `Settings`, CRUD `Supplier`, CRUD `Plan` (leave `Customer`/`Subscription`/credential/import unchecked — those are sub-projects 1b/1c).

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off Etapa 1a items in delivery plan"
```

---

## Self-review notes

- **Spec coverage:** migration+seed (Task 1), Supplier CRUD (Tasks 2-3), Plan CRUD with live margin (Tasks 4-5), Settings two-tab screen (Tasks 6-7), route rename + doc fix (Task 8), verification (Task 9). All spec sections have a task.
- **Deferred, explicitly flagged:** `Customer`/`Subscription`/credential/import (next sub-projects), real WhatsApp channel config (Etapa 3), margin-alert-triggers-something and batch cost-reajuste (Etapa 4) — all called out inline in the spec and in Task 3/4's static warning text.
- **Type consistency checked:** `SupplierDTO`/`PlanDTO`/`SettingsDTO` field names match between `queries.ts` (producer) and every component that destructures them (consumer) across Tasks 2-7. `marginTone`/`cycleLabel` helpers are duplicated between `plan-drawer.tsx` and `plan-table.tsx` (2 occurrences — acceptable per `.claude/rules/02-dry-kiss-yagni.md`, "2 ocorrências = aceitável, observar"; promote to a shared helper only if a 3rd consumer appears).
