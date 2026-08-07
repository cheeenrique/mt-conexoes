# Etapa 1b — Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de `Customer` e `Subscription` (sempre no contexto de um cliente), credencial de acesso criptografada com revelar auditado, ficha do cliente em rota própria com painel de lucro zerado e abas Cobranças/Mensagens desabilitadas (dependem de `Charge`, Etapa 2).

**Architecture:** Mesmas camadas de 1a. `features/customers/` e `features/subscriptions/` seguem exatamente o padrão já estabelecido em `features/suppliers/`/`features/plans/` (schema Zod compartilhado, `z.input` quando o schema tem `.default()`, service com erro local, action fina com `requireSession()` primeiro e `parsed.error.issues[0]?.message` no fallback de validação).

**Tech Stack:** o mesmo de 1a — Next.js App Router, Prisma, react-hook-form + Zod, `PhoneInput`/`DateInput`/`CurrencyInput`/`DataTable`/`StatusBadge`/`ConfirmDialog` já existentes, `lib/crypto.ts` (AES-256-GCM) e `core/dates.ts#firstDueDate` já existentes desde a Etapa 0.

## Global Constraints

- `BigInt` em centavos, `uuid(7)` ids, migrations imutáveis (nova migration sobre a de 1a, nunca editar as anteriores).
- Toda Server Action começa com `requireSession()`, `safeParse` dentro do `try`, erro de validação retorna `parsed.error.issues[0]?.message ?? messages.common.invalidInput` (padrão estabelecido em 1a, não o fallback genérico sempre).
- Mensagens de erro de usuário final sempre pt-BR — todo Zod custom message, nunca deixar cair no default em inglês (bug recorrente em 1a, checar cada campo).
- `z.input<typeof schema>` no genérico do `useForm` quando o schema tem `.default()` (`isActive`); `z.infer` quando não tem.
- Erro de domínio específico de uma feature fica local no `service.ts` daquela feature (`lib/errors.ts` só pra erro cross-feature/infra, convenção de 1a).
- **Senha de acesso nunca cruza pro DTO padrão.** `SubscriptionDTO` usado em listagem/leitura normal não inclui `accessPasswordEnc` nem valor decriptado. Só `revealCredentialAction` devolve o valor, e só depois de gravar `CredentialReveal`.
- **Vencimento nunca é campo de formulário.** `nextDueAt` só nasce de `core/dates.ts#firstDueDate` na criação da assinatura, lendo `Settings.timezone` — nunca hardcoded, nunca editável.
- Filtro/paginação de lista em `searchParams`, nunca `useState`.
- `isActive`/toggle de switch como checkbox simples (`register`, sem `Controller`) — só campos controlados (`CurrencyInput`/`PhoneInput`/`DateInput`) usam `Controller`.
- Commits: Conventional Commits, subject ≤72 chars — contar caracteres antes de usar qualquer mensagem sugerida.
- Orçamento de tamanho: Server Action ≤30 linhas, `service.ts` ≤250, componente React ≤150, `page.tsx` ≤100.

---

### Task 1: Migration — `Customer`, `Subscription`, `CredentialReveal`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_customer_subscription/migration.sql`

**Interfaces:**
- Produces: Prisma models `Customer`, `Subscription`, `CredentialReveal`, enums `SubscriptionStatus`, `DiscountType` — every later task imports the generated Prisma Client types.

- [ ] **Step 1: Add models to `prisma/schema.prisma`**

Append after the existing `Plan` model, and add inverse relations to `Plan`/`Supplier`:

```prisma
enum SubscriptionStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

enum DiscountType {
  PERCENT
  FIXED
}

model Customer {
  id             String   @id @default(uuid(7))
  name           String
  phone          String
  email          String?
  document       String?
  notes          String?
  optedOut       Boolean  @default(false)
  optedOutAt     DateTime?
  optedOutReason String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  subscriptions  Subscription[]

  @@unique([phone])
  @@index([name])
  @@map("customers")
}

model Subscription {
  id                String             @id @default(uuid(7))
  customerId        String
  planId            String?
  supplierId        String?

  priceCents        BigInt
  costCents         BigInt             @default(0)
  cycle             BillingCycle       @default(MONTHLY)

  nextDueAt         DateTime
  startedAt         DateTime           @default(now())

  discountType      DiscountType?
  discountValue     Decimal?           @db.Decimal(10, 2)
  discountUntil     DateTime?

  status            SubscriptionStatus @default(ACTIVE)
  suspendedAt       DateTime?
  cancelledAt       DateTime?
  cancelReason      String?

  accessUsername    String?
  accessPasswordEnc String?
  accessServer      String?
  screens           Int                @default(1)
  accessNotes       String?

  createdAt         DateTime           @default(now())
  updatedAt         DateTime           @updatedAt

  customer          Customer           @relation(fields: [customerId], references: [id])
  plan              Plan?              @relation(fields: [planId], references: [id])
  supplier          Supplier?          @relation(fields: [supplierId], references: [id])

  @@index([status, nextDueAt])
  @@index([customerId])
  @@index([supplierId])
  @@map("subscriptions")
}

model CredentialReveal {
  id             String   @id @default(uuid(7))
  subscriptionId String
  userId         String
  revealedAt     DateTime @default(now())
  ip             String?

  @@index([subscriptionId, revealedAt])
  @@map("credential_reveals")
}
```

Add the inverse relation fields to the existing `Plan` and `Supplier` models (find them in the current `prisma/schema.prisma` and add one line to each, don't touch anything else in those models):

```prisma
// inside model Plan { ... }
subscriptions  Subscription[]

// inside model Supplier { ... }
subscriptions  Subscription[]
```

- [ ] **Step 2: Create the migration folder and SQL**

```bash
mkdir -p prisma/migrations/00000000000002_add_customer_subscription
```

`prisma/migrations/00000000000002_add_customer_subscription/migration.sql`:

```sql
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "document" TEXT,
    "notes" TEXT,
    "optedOut" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "optedOutReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_phone_key" ON "customers"("phone");
CREATE INDEX "customers_name_idx" ON "customers"("name");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT,
    "supplierId" TEXT,
    "priceCents" BIGINT NOT NULL,
    "costCents" BIGINT NOT NULL DEFAULT 0,
    "cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(10,2),
    "discountUntil" TIMESTAMP(3),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "accessUsername" TEXT,
    "accessPasswordEnc" TEXT,
    "accessServer" TEXT,
    "screens" INTEGER NOT NULL DEFAULT 1,
    "accessNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscriptions_status_nextDueAt_idx" ON "subscriptions"("status", "nextDueAt");
CREATE INDEX "subscriptions_customerId_idx" ON "subscriptions"("customerId");
CREATE INDEX "subscriptions_supplierId_idx" ON "subscriptions"("supplierId");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "credential_reveals" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "revealedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "credential_reveals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credential_reveals_subscriptionId_revealedAt_idx" ON "credential_reveals"("subscriptionId", "revealedAt");
```

- [ ] **Step 3: Apply and generate**

```bash
docker compose up -d db
pnpm db:migrate
pnpm dlx prisma generate
```

- [ ] **Step 4: Verify**

```bash
docker exec mt-conexoes-db psql -U mtconexoes -d mtconexoes -c "\d customers"
docker exec mt-conexoes-db psql -U mtconexoes -d mtconexoes -c "\d subscriptions"
pnpm typecheck && pnpm build
```

- [ ] **Step 5: Commit**

```bash
git add prisma
git commit -m "feat(db): add Customer, Subscription, CredentialReveal models"
```

---

### Task 2: `features/customers` backend

**Files:**
- Create: `src/features/customers/schema.ts`
- Create: `src/features/customers/service.ts`
- Create: `src/features/customers/queries.ts`
- Create: `src/features/customers/actions.ts`

**Interfaces:**
- Produces: `customerSchema`, `CustomerDTO { id; name; phone: string; email: string | null; document: string | null; notes: string | null }`, `CustomerListRowDTO extends CustomerDTO { planName: string | null; supplierName: string | null; nextDueAt: string | null }`, `listCustomers(params: { page; perPage; q? }): Promise<{ rows: CustomerListRowDTO[]; total: number }>`, `getCustomer(id): Promise<CustomerDTO | null>`, `createCustomerAction`, `updateCustomerAction` — Task 3 depends on these.

- [ ] **Step 1: `src/features/customers/schema.ts`**

```ts
import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(1, 'Informe o nome do cliente.'),
  phone: z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido.'),
  email: z.string().email('E-mail inválido.').optional().or(z.literal('')),
  document: z.string().optional(),
  notes: z.string().optional(),
});
```

- [ ] **Step 2: `src/features/customers/service.ts`**

```ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import type { z } from 'zod';
import type { customerSchema } from './schema';

type CustomerInput = z.infer<typeof customerSchema>;

export class CustomerPhoneTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um cliente com esse telefone.', 'CUSTOMER_PHONE_TAKEN', { cause });
  }
}

function toData(input: CustomerInput) {
  return {
    name: input.name,
    phone: input.phone,
    email: input.email || null,
    document: input.document || null,
    notes: input.notes || null,
  };
}

export async function createCustomer(input: CustomerInput) {
  try {
    return await db.customer.create({ data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}

export async function updateCustomer(id: string, input: CustomerInput) {
  try {
    return await db.customer.update({ where: { id }, data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new CustomerPhoneTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
```

- [ ] **Step 3: `src/features/customers/queries.ts`**

```ts
import { db } from '@/lib/db';

export interface CustomerDTO {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  notes: string | null;
}

export interface CustomerListRowDTO extends CustomerDTO {
  planName: string | null;
  supplierName: string | null;
  nextDueAt: string | null;
}

function toDTO(row: {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  document: string | null;
  notes: string | null;
}): CustomerDTO {
  return row;
}

export async function listCustomers(params: {
  page: number;
  perPage: 8 | 12 | 20;
  q?: string;
}): Promise<{ rows: CustomerListRowDTO[]; total: number }> {
  const where = params.q
    ? {
        OR: [
          { name: { contains: params.q, mode: 'insensitive' as const } },
          { phone: { contains: params.q } },
          { subscriptions: { some: { accessUsername: { contains: params.q, mode: 'insensitive' as const } } } },
        ],
      }
    : {};

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: {
        subscriptions: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { plan: { select: { name: true } }, supplier: { select: { name: true } } },
        },
      },
    }),
    db.customer.count({ where }),
  ]);

  return {
    rows: rows.map((row) => {
      const sub = row.subscriptions[0];
      return {
        ...toDTO(row),
        planName: sub?.plan?.name ?? null,
        supplierName: sub?.supplier?.name ?? null,
        nextDueAt: sub?.nextDueAt.toISOString() ?? null,
      };
    }),
    total,
  };
}

export async function getCustomer(id: string): Promise<CustomerDTO | null> {
  const row = await db.customer.findUnique({ where: { id } });
  return row ? toDTO(row) : null;
}
```

- [ ] **Step 4: `src/features/customers/actions.ts`**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { customerSchema } from './schema';
import { createCustomer, updateCustomer } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createCustomerAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await createCustomer(parsed.data);
    revalidatePath('/customers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateCustomerAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateCustomer(id, parsed.data);
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 5: Add `messages.customers`**

Read `src/lib/messages.ts` first. Add:

```ts
  customers: {
    created: 'Cliente cadastrado.',
    updated: 'Cliente atualizado.',
  },
```

- [ ] **Step 6: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/customers src/lib/messages.ts
git commit -m "feat(customers): add schema, service, queries, actions"
```

---

### Task 3: `features/customers` frontend — components + `/customers` page

**Files:**
- Create: `src/features/customers/components/customer-table.tsx`
- Create: `src/features/customers/components/customer-drawer.tsx`
- Create: `src/features/customers/components/new-customer-button.tsx`
- Create: `src/app/(app)/customers/page.tsx`

**Interfaces:**
- Consumes: `listCustomers`/`CustomerListRowDTO`/`createCustomerAction`/`updateCustomerAction` (Task 2), `PhoneInput`/`DataTable`/`EmptyState`/`AppShell` (Etapa 0).

- [ ] **Step 1: `src/features/customers/components/customer-drawer.tsx`**

```tsx
'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { customerSchema } from '../schema';
import { createCustomerAction, updateCustomerAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { CustomerDTO } from '../queries';

type FormValues = z.infer<typeof customerSchema>;

export function CustomerDrawer({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDTO | null;
}) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(customerSchema),
    values: customer
      ? { name: customer.name, phone: customer.phone, email: customer.email ?? '', document: customer.document ?? '', notes: customer.notes ?? '' }
      : { name: '', phone: '', email: '', document: '', notes: '' },
  });

  async function onSubmit(values: FormValues) {
    const result = customer
      ? await updateCustomerAction(customer.id, values)
      : await createCustomerAction(values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(customer ? messages.customers.updated : messages.customers.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] bg-surface">
        <DialogHeader>
          <DialogTitle>{customer ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="phone">Telefone</Label>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput id="phone" value={field.value} onValueChange={field.onChange} />
              )}
            />
            {errors.phone && <p className="mt-1 text-sm text-danger">{errors.phone.message}</p>}
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} className="h-11" />
            {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
          </div>
          <div>
            <Label htmlFor="document">Documento (CPF/CNPJ)</Label>
            <Input id="document" {...register('document')} className="h-11" />
          </div>
          <div>
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              {...register('notes')}
              className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
            />
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`customerSchema` has no `.default()` field, so `z.infer` is correct here (same reasoning as `settingsSchema` in 1a — verify by reading the schema before assuming either way).

- [ ] **Step 2: `src/features/customers/components/new-customer-button.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CustomerDrawer } from './customer-drawer';

export function NewCustomerButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Novo cliente</Button>
      <CustomerDrawer open={open} onOpenChange={setOpen} customer={null} />
    </>
  );
}
```

- [ ] **Step 3: `src/features/customers/components/customer-table.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Search, Users } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { CustomerDrawer } from './customer-drawer';
import type { CustomerListRowDTO } from '../queries';

function formatDueDate(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

export function CustomerTable({
  rows,
  total,
  page,
  perPage,
  q,
}: {
  rows: CustomerListRowDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
  q: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<CustomerListRowDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/customers?${params.toString()}`);
  }

  const columns: Column<CustomerListRowDTO>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <Link href={`/customers/${row.id}`} className="font-semibold text-foreground hover:text-brand">
            {row.name}
          </Link>
          <p className="font-mono text-xs tabular-mono text-foreground-muted">{row.phone}</p>
        </div>
      ),
    },
    { header: 'Plano', cell: (row) => row.planName ?? '—' },
    { header: 'Fornecedor', cell: (row) => row.supplierName ?? '—' },
    { header: 'Vencimento', align: 'right', cell: (row) => formatDueDate(row.nextDueAt) },
    { header: 'Situação', cell: () => <StatusBadge tone="neutral">—</StatusBadge> },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar cliente"
          title="Editar cliente"
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
      <div className="mb-4 flex items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" />
        <input
          defaultValue={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Buscar por nome, telefone ou usuário de acesso"
          className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
      </div>
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
            icon={Users}
            title="Nenhum cliente cadastrado"
            description="Cadastre o assinante que usa o serviço."
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Cadastrar o primeiro</Button>}
          />
        }
      />
      <CustomerDrawer open={drawerOpen} onOpenChange={setDrawerOpen} customer={editing} />
    </>
  );
}
```

- [ ] **Step 4: `src/app/(app)/customers/page.tsx`**

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { listCustomers } from '@/features/customers/queries';
import { CustomerTable } from '@/features/customers/components/customer-table';
import { NewCustomerButton } from '@/features/customers/components/new-customer-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;
  const q = params.q ?? '';

  const { rows, total } = await listCustomers({ page, perPage, q: q || undefined });

  return (
    <AppShell title="Clientes" primaryAction={<NewCustomerButton />}>
      <CustomerTable rows={rows} total={total} page={page} perPage={perPage} q={q} />
    </AppShell>
  );
}
```

- [ ] **Step 5: Verify + commit**

```bash
docker compose up -d db
pnpm typecheck && pnpm build
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/customers  # expect 307
kill %1
```

```bash
git add src/features/customers/components src/app/\(app\)/customers/page.tsx
git commit -m "feat(customers): add table, drawer, search, and /customers page"
```

---

### Task 4: `features/subscriptions` backend — schema, service, queries, actions, credential

**Files:**
- Create: `src/features/subscriptions/schema.ts`
- Create: `src/features/subscriptions/service.ts`
- Create: `src/features/subscriptions/queries.ts`
- Create: `src/features/subscriptions/actions.ts`
- Modify: `src/features/plans/queries.ts` (add `listActivePlansForSelect`)

**Interfaces:**
- Consumes: `db`, `DomainError`, `messages`, `logger`, `requireSession`, `encrypt`/`decrypt`/`CryptoPurpose` (`@/lib/crypto`), `firstDueDate`/`BillingCycle` (`@/core/dates`), `getSettings` (`@/features/settings/queries`), `listActiveSuppliersForSelect` (`@/features/suppliers/queries`).
- Produces: `subscriptionSchema`, `SubscriptionDTO` (no password field), `listActivePlansForSelect(): Promise<{id;name;priceCents;costCents;cycle;supplierId}[]>`, `listSubscriptionsForCustomer(customerId): Promise<SubscriptionDTO[]>`, `getSubscription(id): Promise<SubscriptionDTO | null>`, `createSubscriptionAction`, `updateSubscriptionAction`, `revealCredentialAction(subscriptionId): Promise<{ok:true; value:string} | {error:...}>` — Task 5 depends on all of these.

- [ ] **Step 1: `src/features/plans/queries.ts` — add `listActivePlansForSelect`**

Read the file first, append at the end:

```ts
export async function listActivePlansForSelect(): Promise<{
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  supplierId: string | null;
}[]> {
  const rows = await db.plan.findMany({
    where: { isActive: true },
    select: { id: true, name: true, priceCents: true, costCents: true, cycle: true, supplierId: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    supplierId: row.supplierId,
  }));
}
```

- [ ] **Step 2: `src/features/subscriptions/schema.ts`**

```ts
import { z } from 'zod';

export const subscriptionSchema = z.object({
  planId: z.string().uuid('Plano inválido.').optional().or(z.literal('')),
  supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
  priceCents: z.string().regex(/^\d+$/, 'Preço inválido.'),
  costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
  discountType: z.enum(['PERCENT', 'FIXED']).optional().or(z.literal('')),
  discountValue: z.string().optional(),
  discountUntil: z.string().optional(),
  accessUsername: z.string().optional(),
  accessPassword: z.string().optional(),
  accessServer: z.string().optional(),
  screens: z.number().int().min(1, 'Mínimo 1 tela.').default(1),
  accessNotes: z.string().optional(),
});
```

- [ ] **Step 3: `src/features/subscriptions/service.ts`**

```ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { firstDueDate } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';
import type { z } from 'zod';
import type { subscriptionSchema } from './schema';

type SubscriptionInput = z.infer<typeof subscriptionSchema>;

export class SubscriptionNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND', { cause });
  }
}

function toBaseData(input: SubscriptionInput) {
  return {
    planId: input.planId || null,
    supplierId: input.supplierId || null,
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    discountType: input.discountType || null,
    discountValue: input.discountValue ? input.discountValue : null,
    discountUntil: input.discountUntil ? new Date(input.discountUntil) : null,
    accessUsername: input.accessUsername || null,
    accessPasswordEnc: input.accessPassword
      ? encrypt(input.accessPassword, 'subscription.accessPassword')
      : undefined,
    accessServer: input.accessServer || null,
    screens: input.screens,
    accessNotes: input.accessNotes || null,
  };
}

export async function createSubscription(customerId: string, input: SubscriptionInput) {
  const settings = await getSettings();
  const startedAt = new Date();
  const nextDueAt = firstDueDate({ startedAt, cycle: input.cycle, timezone: settings.timezone });

  return db.subscription.create({
    data: {
      customerId,
      startedAt,
      nextDueAt,
      ...toBaseData(input),
    },
  });
}

export async function updateSubscription(id: string, input: SubscriptionInput) {
  const existing = await db.subscription.findUnique({ where: { id } });
  if (!existing) throw new SubscriptionNotFoundError();

  return db.subscription.update({
    where: { id },
    data: toBaseData(input),
  });
}

export async function revealCredential(subscriptionId: string, userId: string, ip: string | null) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new SubscriptionNotFoundError();
  if (!subscription.accessPasswordEnc) return '';

  await db.credentialReveal.create({ data: { subscriptionId, userId, ip } });
  return decrypt(subscription.accessPasswordEnc, 'subscription.accessPassword');
}
```

⚠️ `toBaseData`'s `accessPasswordEnc: undefined` when the operator left the password field blank on an EDIT means Prisma's `update` leaves the column untouched (Prisma ignores `undefined` fields in `data`) — the encrypted password only changes when a new plaintext value is actually typed. On CREATE, `undefined` writes `NULL` via the column default, which is correct (no credential yet).

- [ ] **Step 4: `src/features/subscriptions/queries.ts`**

```ts
import { db } from '@/lib/db';
import type { BillingCycle, DiscountType, SubscriptionStatus } from '@prisma/client';

export interface SubscriptionDTO {
  id: string;
  customerId: string;
  planId: string | null;
  planName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  nextDueAt: string;
  startedAt: string;
  discountType: DiscountType | null;
  discountValue: string | null;
  discountUntil: string | null;
  status: SubscriptionStatus;
  accessUsername: string | null;
  hasAccessPassword: boolean;
  accessServer: string | null;
  screens: number;
  accessNotes: string | null;
}

function toDTO(row: {
  id: string;
  customerId: string;
  planId: string | null;
  plan: { name: string } | null;
  supplierId: string | null;
  supplier: { name: string } | null;
  priceCents: bigint;
  costCents: bigint;
  cycle: BillingCycle;
  nextDueAt: Date;
  startedAt: Date;
  discountType: DiscountType | null;
  discountValue: unknown;
  discountUntil: Date | null;
  status: SubscriptionStatus;
  accessUsername: string | null;
  accessPasswordEnc: string | null;
  accessServer: string | null;
  screens: number;
  accessNotes: string | null;
}): SubscriptionDTO {
  return {
    id: row.id,
    customerId: row.customerId,
    planId: row.planId,
    planName: row.plan?.name ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    nextDueAt: row.nextDueAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    discountType: row.discountType,
    discountValue: row.discountValue ? String(row.discountValue) : null,
    discountUntil: row.discountUntil ? row.discountUntil.toISOString() : null,
    status: row.status,
    accessUsername: row.accessUsername,
    hasAccessPassword: !!row.accessPasswordEnc,
    accessServer: row.accessServer,
    screens: row.screens,
    accessNotes: row.accessNotes,
  };
}

const INCLUDE = { plan: { select: { name: true } }, supplier: { select: { name: true } } } as const;

export async function listSubscriptionsForCustomer(customerId: string): Promise<SubscriptionDTO[]> {
  const rows = await db.subscription.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE,
  });
  return rows.map(toDTO);
}

export async function getSubscription(id: string): Promise<SubscriptionDTO | null> {
  const row = await db.subscription.findUnique({ where: { id }, include: INCLUDE });
  return row ? toDTO(row) : null;
}
```

Note: `SubscriptionDTO` never exposes `accessPasswordEnc` — only the derived boolean `hasAccessPassword`, so the drawer knows whether to show "mascarada, tem senha" vs. "sem senha cadastrada" without ever receiving the ciphertext.

- [ ] **Step 5: `src/features/subscriptions/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { subscriptionSchema } from './schema';
import { createSubscription, updateSubscription, revealCredential } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };
type RevealResult = { ok: true; value: string } | { error: { code: string; message: string } };

export async function createSubscriptionAction(customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await createSubscription(customerId, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateSubscriptionAction(id: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = subscriptionSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateSubscription(id, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function revealCredentialAction(subscriptionId: string): Promise<RevealResult> {
  try {
    const user = await requireSession();
    const ip = (await headers()).get('x-forwarded-for');
    const value = await revealCredential(subscriptionId, user.id, ip);
    return { ok: true as const, value };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'subscriptions.revealCredential', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

⚠️ `revealCredentialAction` deliberately does NOT log the subscription id's related customer name or any credential data — only `route` + `error` + `stack` on the failure path, matching `.claude/rules/02-servidor.md`'s log rule. On the success path it logs nothing at all (no need — the DB audit trail via `CredentialReveal` is the record of truth, a duplicate log entry would be redundant exposure surface).

- [ ] **Step 6: Add `messages.subscriptions`**

```ts
  subscriptions: {
    created: 'Assinatura cadastrada.',
    updated: 'Assinatura atualizada.',
  },
```

- [ ] **Step 7: Integration test for `revealCredential` — proves the audit-before-return invariant**

This is the one piece of this plan that touches a hard security rule (`CredentialReveal` must be written BEFORE the value returns) — worth a real test, not just code review, per `.claude/rules/06-testes.md`'s general principle that security-critical invariants get tested even outside the mandatory-TDD list.

`src/features/subscriptions/service.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { revealCredential } from './service';

const CUSTOMER_PHONE = '+5511999990001';

let customerId: string;
let subscriptionId: string;
let userId: string;

beforeEach(async () => {
  const customer = await db.customer.create({ data: { name: 'Teste Revelar', phone: CUSTOMER_PHONE } });
  customerId = customer.id;

  const subscription = await db.subscription.create({
    data: {
      customerId,
      priceCents: 1000n,
      nextDueAt: new Date(),
      accessUsername: 'joao.silva',
      accessPasswordEnc: encrypt('senha-real-123', 'subscription.accessPassword'),
    },
  });
  subscriptionId = subscription.id;

  const user = await db.user.create({ data: { email: 'reveal-test@mtconexoes.com.br', name: 'Teste', passwordHash: 'x' } });
  userId = user.id;
});

afterEach(async () => {
  await db.credentialReveal.deleteMany({ where: { subscriptionId } });
  await db.subscription.deleteMany({ where: { customerId } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.user.deleteMany({ where: { id: userId } });
});

describe('revealCredential', () => {
  it('grava CredentialReveal antes de devolver o valor decriptado', async () => {
    const value = await revealCredential(subscriptionId, userId, '127.0.0.1');
    expect(value).toBe('senha-real-123');

    const reveals = await db.credentialReveal.findMany({ where: { subscriptionId } });
    expect(reveals).toHaveLength(1);
    expect(reveals[0].userId).toBe(userId);
  });

  it('cada chamada grava uma auditoria nova, não deduplica', async () => {
    await revealCredential(subscriptionId, userId, '127.0.0.1');
    await revealCredential(subscriptionId, userId, '127.0.0.1');

    const reveals = await db.credentialReveal.findMany({ where: { subscriptionId } });
    expect(reveals).toHaveLength(2);
  });
});
```

- [ ] **Step 8: Verify + commit**

```bash
docker compose up -d db
pnpm typecheck && pnpm build
pnpm test:integration -- subscriptions
```

```bash
git add src/features/subscriptions src/features/plans/queries.ts src/lib/messages.ts
git commit -m "feat(subscriptions): add schema, service, queries, actions, credential reveal"
```

---

### Task 5: `features/subscriptions` frontend — drawer + credential reveal dialog

**Files:**
- Create: `src/features/subscriptions/components/subscription-drawer.tsx`
- Create: `src/features/subscriptions/components/credential-reveal-dialog.tsx`
- Create: `src/features/subscriptions/components/subscription-list.tsx`

**Interfaces:**
- Consumes: `subscriptionSchema`/`SubscriptionDTO`/`createSubscriptionAction`/`updateSubscriptionAction`/`revealCredentialAction` (Task 4), `listActivePlansForSelect` (Task 4 addition to plans), `listActiveSuppliersForSelect` (1a), `marginPercent` (`@/core/money`), `CurrencyInput`/`DateInput`/`StatusBadge`/`ConfirmDialog`.

- [ ] **Step 1: `src/features/subscriptions/components/credential-reveal-dialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { revealCredentialAction } from '../actions';
import { toastError } from '@/lib/toast';

const AUTO_CLOSE_MS = 30_000;

export function CredentialRevealDialog({ subscriptionId }: { subscriptionId: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue(null);
      setCopied(false);
      return;
    }
    const timer = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  async function handleReveal() {
    const result = await revealCredentialAction(subscriptionId);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    setValue(result.value);
    setOpen(true);
  }

  async function handleCopy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Revelar senha"
        title="Revelar senha"
        onClick={handleReveal}
        className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
      >
        <Eye size={15} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[420px] bg-surface">
          <DialogHeader>
            <DialogTitle>Senha de acesso</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3 py-2">
            <span className="flex-1 font-mono text-sm tabular-mono text-foreground">{value}</span>
            <button type="button" aria-label="Copiar" title="Copiar" onClick={handleCopy}>
              {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-xs text-foreground-muted">Este acesso foi registrado.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: `src/features/subscriptions/components/subscription-drawer.tsx`**

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
import { DateInput } from '@/components/ui/date-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { subscriptionSchema } from '../schema';
import { createSubscriptionAction, updateSubscriptionAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SubscriptionDTO } from '../queries';

type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };
type FormValues = z.input<typeof subscriptionSchema>;

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

export function SubscriptionDrawer({
  open,
  onOpenChange,
  customerId,
  subscription,
  plans,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  subscription: SubscriptionDTO | null;
  plans: PlanOption[];
  suppliers: { id: string; name: string }[];
}) {
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(subscriptionSchema),
    values: subscription
      ? {
          planId: subscription.planId ?? '',
          supplierId: subscription.supplierId ?? '',
          priceCents: subscription.priceCents,
          costCents: subscription.costCents,
          cycle: subscription.cycle,
          discountType: subscription.discountType ?? '',
          discountValue: subscription.discountValue ?? '',
          discountUntil: subscription.discountUntil?.slice(0, 10) ?? '',
          accessUsername: subscription.accessUsername ?? '',
          accessPassword: '',
          accessServer: '',
          screens: subscription.screens,
          accessNotes: subscription.accessNotes ?? '',
        }
      : { planId: '', supplierId: '', priceCents: '0', costCents: '0', cycle: 'MONTHLY', discountType: '', discountValue: '', discountUntil: '', accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '' },
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

  function handlePlanChange(planId: string) {
    setValue('planId', planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setValue('priceCents', plan.priceCents);
    setValue('costCents', plan.costCents);
    setValue('cycle', plan.cycle as FormValues['cycle']);
    if (plan.supplierId) setValue('supplierId', plan.supplierId);
  }

  async function onSubmit(values: FormValues) {
    const result = subscription
      ? await updateSubscriptionAction(subscription.id, customerId, values)
      : await createSubscriptionAction(customerId, values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(subscription ? messages.subscriptions.updated : messages.subscriptions.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] bg-surface">
        <DialogHeader>
          <DialogTitle>{subscription ? 'Editar assinatura' : 'Nova assinatura'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="planId">Plano</Label>
            <select
              id="planId"
              {...register('planId')}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
            >
              <option value="">Nenhum</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="priceCents">Preço</Label>
            <Controller control={control} name="priceCents" render={({ field }) => (
              <CurrencyInput id="priceCents" value={field.value} onValueChange={field.onChange} />
            )} />
            {errors.priceCents && <p className="mt-1 text-sm text-danger">{errors.priceCents.message}</p>}
          </div>
          <div>
            <Label htmlFor="costCents">Custo</Label>
            <Controller control={control} name="costCents" render={({ field }) => (
              <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
            )} />
            {errors.costCents && <p className="mt-1 text-sm text-danger">{errors.costCents.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Margem:</span>
            <StatusBadge tone={marginTone(liveMargin)}>{liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}</StatusBadge>
          </div>
          <div>
            <Label htmlFor="cycle">Ciclo</Label>
            <select id="cycle" {...register('cycle')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="MONTHLY">Mensal</option>
              <option value="QUARTERLY">Trimestral</option>
              <option value="SEMIANNUAL">Semestral</option>
              <option value="ANNUAL">Anual</option>
            </select>
          </div>
          <div>
            <Label htmlFor="supplierId">Fornecedor</Label>
            <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="discountType">Desconto</Label>
            <select id="discountType" {...register('discountType')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              <option value="PERCENT">Percentual</option>
              <option value="FIXED">Fixo</option>
            </select>
          </div>
          <div>
            <Label htmlFor="discountValue">Valor do desconto</Label>
            <Input id="discountValue" {...register('discountValue')} className="h-11" />
          </div>
          <div>
            <Label htmlFor="discountUntil">Válido até</Label>
            <Controller control={control} name="discountUntil" render={({ field }) => (
              <DateInput id="discountUntil" value={field.value ?? ''} onValueChange={field.onChange} />
            )} />
          </div>
          {subscription && (
            <p className="font-mono text-sm tabular-mono text-foreground-muted">
              Próximo vencimento: {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(subscription.nextDueAt))}
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            O novo valor vale a partir da próxima cobrança gerada. Cobranças já emitidas não mudam.
          </p>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground-muted">Acesso</p>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="accessUsername">Usuário</Label>
                <Input id="accessUsername" {...register('accessUsername')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessPassword">
                  Senha {subscription?.hasAccessPassword && '(deixe em branco para manter a atual)'}
                </Label>
                <Input id="accessPassword" type="password" {...register('accessPassword')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessServer">Servidor</Label>
                <Input id="accessServer" {...register('accessServer')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="screens">Telas</Label>
                <Input id="screens" type="number" min={1} {...register('screens', { valueAsNumber: true })} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessNotes">Observações de acesso</Label>
                <textarea id="accessNotes" {...register('accessNotes')} className="min-h-16 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`subscriptionSchema` has `screens: z.number().int().min(1).default(1)` — a `.default()` field, so `FormValues = z.input<typeof subscriptionSchema>` (already applied above, consistent with Tasks 3/5 of 1a).

- [ ] **Step 3: `src/features/subscriptions/components/subscription-list.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { CredentialRevealDialog } from './credential-reveal-dialog';
import { SubscriptionDrawer } from './subscription-drawer';
import type { SubscriptionDTO } from '../queries';

export function SubscriptionList({
  customerId,
  subscriptions,
  plans,
  suppliers,
}: {
  customerId: string;
  subscriptions: SubscriptionDTO[];
  plans: { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null }[];
  suppliers: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState<SubscriptionDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Nova assinatura</Button>
      </div>
      {subscriptions.length === 0 && (
        <p className="text-sm text-foreground-muted">Nenhuma assinatura cadastrada.</p>
      )}
      {subscriptions.map((sub) => (
        <div key={sub.id} className="rounded border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-foreground">{sub.planName ?? 'Sem plano'}</p>
            <StatusBadge tone={sub.status === 'ACTIVE' ? 'success' : 'neutral'}>{sub.status}</StatusBadge>
          </div>
          <p className="font-mono text-sm tabular-mono text-foreground-muted">
            {formatCents(sub.priceCents)} · {sub.cycle} · {sub.supplierName ?? 'sem fornecedor'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            {sub.accessUsername && (
              <span className="font-mono text-xs tabular-mono text-foreground-muted">
                {sub.accessUsername} · {sub.hasAccessPassword ? '••••••••' : 'sem senha'}
              </span>
            )}
            {sub.hasAccessPassword && <CredentialRevealDialog subscriptionId={sub.id} />}
            <button
              type="button"
              aria-label="Editar assinatura"
              title="Editar assinatura"
              onClick={() => { setEditing(sub); setDrawerOpen(true); }}
              className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
            >
              <Pencil size={15} />
            </button>
          </div>
        </div>
      ))}
      <SubscriptionDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        customerId={customerId}
        subscription={editing}
        plans={plans}
        suppliers={suppliers}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/subscriptions/components
git commit -m "feat(subscriptions): add drawer, credential reveal dialog, list"
```

---

### Task 6: Ficha do cliente — `/customers/[id]`

**Files:**
- Create: `src/features/customers/components/customer-profile-header.tsx`
- Create: `src/features/customers/components/customer-tabs.tsx`
- Create: `src/app/(app)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `getCustomer` (Task 2), `listSubscriptionsForCustomer` (Task 4), `listActivePlansForSelect` (Task 4), `listActiveSuppliersForSelect` (1a), `SubscriptionList` (Task 5), `formatCents` (`@/lib/format`).

- [ ] **Step 1: `src/features/customers/components/customer-profile-header.tsx`**

```tsx
import { formatCents } from '@/lib/format';
import { StatusBadge } from '@/components/ui/status-badge';

export function CustomerProfileHeader({
  name,
  supplierName,
  since,
  active,
}: {
  name: string;
  supplierName: string | null;
  since: string;
  active: boolean;
}) {
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
      {/* TODO Etapa 2: SUM(charge.principalCents - discountCents) e SUM(charge.costCents) por
          customerId, ver docs/projeto/tecnico/04-dinheiro-e-margem.md. Sem Charge ainda, os
          números abaixo são zero de verdade, não um placeholder de UI. */}
      <div className="grid grid-cols-5 gap-4 border-t border-border pt-4 font-mono text-sm tabular-mono">
        <div>
          <p className="text-xs text-foreground-muted">Faturado</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Margem</p>
          <p className="text-foreground">—</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/features/customers/components/customer-tabs.tsx`**

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS = [
  { key: 'subscriptions', label: 'Assinaturas', disabled: false, title: undefined },
  { key: 'charges', label: 'Cobranças', disabled: true, title: 'Disponível na Etapa 2' },
  { key: 'messages', label: 'Mensagens', disabled: true, title: 'Disponível na Etapa 3' },
] as const;

export function CustomerTabs({
  customerId,
  aba,
  children,
}: {
  customerId: string;
  aba: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4 flex gap-2">
        {TABS.map((tab) =>
          tab.disabled ? (
            <span
              key={tab.key}
              title={tab.title}
              className="flex h-10 items-center rounded-sm border border-border px-4 text-sm font-semibold text-foreground-disabled opacity-50"
            >
              {tab.label}
            </span>
          ) : (
            <Link
              key={tab.key}
              href={`/customers/${customerId}?aba=${tab.key}`}
              className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === tab.key ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
            >
              {tab.label}
            </Link>
          ),
        )}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: `src/app/(app)/customers/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { getCustomer } from '@/features/customers/queries';
import { listSubscriptionsForCustomer } from '@/features/subscriptions/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { CustomerProfileHeader } from '@/features/customers/components/customer-profile-header';
import { CustomerTabs } from '@/features/customers/components/customer-tabs';
import { SubscriptionList } from '@/features/subscriptions/components/subscription-list';

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  await searchParams; // única aba real hoje é "subscriptions" — ?aba= é lido aqui pra manter o
  // padrão de URL-as-state estabelecido em 1a; passa a ramificar quando Cobranças/Mensagens
  // ganharem conteúdo real (Etapa 2/3), não antes.
  const aba = 'subscriptions';

  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [subscriptions, plans, suppliers] = await Promise.all([
    listSubscriptionsForCustomer(id),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
  ]);

  const activeSub = subscriptions.find((s) => s.status === 'ACTIVE');
  const since = new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(
    subscriptions.length > 0 ? new Date(subscriptions[subscriptions.length - 1].startedAt) : new Date(),
  );

  return (
    <AppShell title={customer.name}>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft size={15} /> Voltar
      </Link>
      <CustomerProfileHeader
        name={customer.name}
        supplierName={activeSub?.supplierName ?? null}
        since={since}
        active={!!activeSub}
      />
      <div className="mt-6">
        <CustomerTabs customerId={id} aba={aba}>
          <SubscriptionList customerId={id} subscriptions={subscriptions} plans={plans} suppliers={suppliers} />
        </CustomerTabs>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 4: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/features/customers/components/customer-profile-header.tsx src/features/customers/components/customer-tabs.tsx "src/app/(app)/customers/[id]"
git commit -m "feat(customers): add customer profile page with tabs"
```

---

### Task 7: Sidebar route fix

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:** none new.

- [ ] **Step 1: Update the "Clientes" menu item's `href`**

Read the file first — change `href: '/clientes'` to `href: '/customers'`. Keep `label: 'Clientes'` unchanged. Leave every other menu item untouched.

- [ ] **Step 2: Verify + commit**

```bash
pnpm typecheck && pnpm build
git add src/components/layout/sidebar.tsx
git commit -m "fix(nav): point Clientes menu item at /customers"
```

---

### Task 8: Final verification pass

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

- [ ] **Step 2: Manual end-to-end smoke check**

```bash
pnpm dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/customers        # 307
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/customers/xyz    # 307 (redirect wins before notFound, no session)
kill %1
```

- [ ] **Step 3: Update `docs/projeto/tecnico/07-plano-de-entrega.md`**

Check off: CRUD `Customer`, CRUD `Subscription` (vencimento calculado), credencial de acesso (criptografada, mascarada, revelar auditado), margem calculada no formulário, lista de clientes com busca, ficha do cliente com as assinaturas. Leave "Importação da base atual" unchecked (sub-projeto 1c).

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off Etapa 1b items in delivery plan"
```

---

## Self-review notes

- **Spec coverage:** migration (Task 1), Customer CRUD (Tasks 2-3), Subscription CRUD + credential encrypt/reveal (Tasks 4-5), ficha do cliente with zeroed profit panel + disabled tabs (Task 6), sidebar fix (Task 7), verification (Task 8). All spec sections have a task.
- **Deferred, explicitly flagged:** `Charge`/`Payment` and everything depending on them (real profit panel, situação de cobrança, aba Cobranças) — Etapa 2. Opt-out UI — Etapa 3/4. Importação — 1c.
- **Type consistency checked:** `SubscriptionDTO` never carries `accessPasswordEnc`, only the derived `hasAccessPassword` boolean — checked across Task 4 (producer) and Task 5/6 (consumers). `CustomerDTO`/`CustomerListRowDTO` field names match between `queries.ts` and every consuming component. `PlanOption` shape in Task 5's `subscription-drawer.tsx` matches exactly what `listActivePlansForSelect` (Task 4) returns.
- **Security-critical path gets a real test:** Task 4's Step 7 integration test proves `CredentialReveal` is written before the value returns, and that repeated reveals don't dedupe — the one piece of this plan that isn't "just CRUD."
