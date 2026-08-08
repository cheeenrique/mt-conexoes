# Etapa 1c — Importação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Revision note:** this plan was updated after the client sent the real spreadsheet
> (`Planilha para cadastro de Clientes UNIPLAY 2026.xlsm`). Task 1 was already implemented and
> committed against the original (assumed) column names before the real file arrived — it needed
> no changes (the parsing primitives are format-agnostic). Task 2 (Customer.phone becomes
> optional) is new, inserted because 100% of the real file's rows have no WhatsApp number. Tasks
> 3-6 (previously 2-5) are revised to match the real column names/format and the phone-optional
> decision. See `docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md` for the full
> reasoning.

**Goal:** Script `scripts/import-customers.ts` que lê um `.xlsx`/`.xlsm` (um arquivo por fornecedor), consolida clientes por telefone quando presente, cria `Customer`/`Subscription` usando o vencimento da planilha diretamente (sem calcular via `firstDueDate`), recusa linha inválida com motivo, é idempotente, e produz relatório com totais.

**Architecture:** Script standalone, mesmo padrão de `prisma/seed.ts` — Prisma direto, sem Server Action, sem sessão HTTP, roda via `tsx`. Reaproveita `lib/crypto.ts` (encrypt de senha). **Não** reaproveita `features/subscriptions/service.ts#createSubscription` porque essa função calcula `nextDueAt` via `firstDueDate` — a importação usa o vencimento dado, decisão registrada na spec.

**Tech Stack:** `xlsx` (nova dependência, só usada neste script — não entra no bundle do app), Prisma, `tsx`.

## Global Constraints

- Vencimento (`nextDueAt`) da planilha vai **direto** pro banco — nunca recalculado via `firstDueDate`/`nextDueDate` na importação (decisão registrada na spec, diferente da regra normal do app).
- `BigInt` em centavos pra `priceCents`/`costCents`, conversão de reais pra centavos com round half up, uma vez, sem passar por float intermediário evitável.
- Senha de acesso criptografada com `lib/crypto.ts#encrypt(valor, 'subscription.accessPassword')` antes de qualquer persistência — nunca gravar em claro, nunca logar o valor. A planilha real guarda a senha como **número** — converter pra string antes de criptografar.
- Telefone normalizado pra E.164 quando presente; **`Customer.phone` é opcional** (decisão desta etapa, ver Task 2) — ausência de telefone não é motivo de recusa de linha.
- Linha inválida (nome vazio, vencimento ausente/impossível, valor negativo) é **recusada com motivo**, nunca importada com valor chutado.
- Idempotente: rodar o mesmo arquivo duas vezes não duplica `Subscription`. Checagem de idempotência acontece **antes** de tocar em `Customer` (telefone nulo não serve de chave de upsert).
- Leitura do `.xlsx`/`.xlsm` sempre com `cellDates: true` — sem essa opção, células de data chegam como número serial do Excel, inútil sem conversão.
- Nome de coluna comparado com `trim()` — cabeçalhos reais têm espaço em branco (`" VALOR "`).
- Sem `console.log` de dado sensível (senha em claro nunca aparece no relatório nem no console).
- Commits: Conventional Commits, subject ≤72 chars — contar caracteres antes de usar qualquer mensagem sugerida.

---

### Task 1: Dependência `xlsx` + utilitários de parsing (telefone, dinheiro, data) — ✅ JÁ IMPLEMENTADO

**Status:** completo e commitado antes desta revisão do plano (o arquivo real ainda não tinha chegado, mas os utilitários são agnósticos de nome de coluna — nada muda aqui). Se você está executando este plano do zero, siga os passos abaixo normalmente; se está retomando depois da revisão, **pule pra Task 2**.

**Files:**
- Modify: `package.json` (add `xlsx` dependency)
- Create: `scripts/import/parse-row.ts`
- Create: `scripts/import/parse-row.test.ts`

**Interfaces:**
- Produces: `normalizePhoneBR(raw: string): string | null`, `parseCentsFromBR(raw: string | number): bigint | null`, `parseDateBR(raw: string | number | Date): Date | null`.
- Consumed by: Task 4's main script.

- [ ] **Step 1: Install `xlsx`**

```bash
pnpm add xlsx
```

- [ ] **Step 2: Write failing tests — `scripts/import/parse-row.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { normalizePhoneBR, parseCentsFromBR, parseDateBR } from './parse-row';

describe('normalizePhoneBR', () => {
  it('normaliza (11) 99999-8888 pra E.164', () => {
    expect(normalizePhoneBR('(11) 99999-8888')).toBe('+5511999998888');
  });

  it('normaliza 11999998888 sem formatação', () => {
    expect(normalizePhoneBR('11999998888')).toBe('+5511999998888');
  });

  it('aceita já em E.164', () => {
    expect(normalizePhoneBR('+5511999998888')).toBe('+5511999998888');
  });

  it('rejeita número sem DDD (recusa em vez de chutar)', () => {
    expect(normalizePhoneBR('9999-8888')).toBeNull();
  });

  it('rejeita vazio', () => {
    expect(normalizePhoneBR('')).toBeNull();
  });
});

describe('parseCentsFromBR', () => {
  it('parseia "R$ 1.234,56"', () => {
    expect(parseCentsFromBR('R$ 1.234,56')).toBe(123456n);
  });

  it('parseia "1234,56" sem prefixo', () => {
    expect(parseCentsFromBR('1234,56')).toBe(123456n);
  });

  it('parseia "1234.56" (formato US, caso o Excel exporte assim)', () => {
    expect(parseCentsFromBR('1234.56')).toBe(123456n);
  });

  it('parseia número puro (célula numérica do Excel)', () => {
    expect(parseCentsFromBR(1234.56)).toBe(123456n);
  });

  it('rejeita valor negativo', () => {
    expect(parseCentsFromBR('-10,00')).toBeNull();
  });

  it('rejeita texto não numérico', () => {
    expect(parseCentsFromBR('grátis')).toBeNull();
  });
});

describe('parseDateBR', () => {
  it('parseia "07/08/2026"', () => {
    const date = parseDateBR('07/08/2026');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('aceita um objeto Date direto (xlsx já converteu célula formatada como data)', () => {
    const input = new Date('2026-08-07T12:00:00Z');
    expect(parseDateBR(input)).toBe(input);
  });

  it('rejeita string vazia', () => {
    expect(parseDateBR('')).toBeNull();
  });

  it('rejeita data impossível', () => {
    expect(parseDateBR('32/13/2026')).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- parse-row`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `scripts/import/parse-row.ts`**

```ts
/** Normaliza telefone brasileiro pra E.164 (+55DDDNÚMERO). null se impossível — nunca chuta DDD. */
export function normalizePhoneBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return null;
}

/** Converte valor em reais (string BR/US ou número) pra centavos. null se inválido ou negativo. */
export function parseCentsFromBR(raw: string | number): bigint | null {
  if (typeof raw === 'number') {
    if (raw < 0 || !Number.isFinite(raw)) return null;
    return BigInt(Math.round(raw * 100));
  }

  const cleaned = raw.trim().replace(/^R\$\s*/i, '');
  if (!cleaned) return null;

  let normalized: string;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [intPart, fracPart = ''] = normalized.split('.');
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(cents || '0');
}

/** Aceita "DD/MM/AAAA" ou um Date já convertido pelo parser do xlsx. null se inválido. */
export function parseDateBR(raw: string | number | Date): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- parse-row`
Expected: PASS, all cases green.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/import
git commit -m "feat(import): add xlsx dependency and row-parsing utilities"
```

---

### Task 2: `Customer.phone` becomes optional

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_customer_phone_optional/migration.sql`
- Modify: `src/features/customers/schema.ts`
- Modify: `src/features/customers/queries.ts` (verify search tolerates null phone — likely no code change needed, add a test proving it)
- Create/modify: `src/features/customers/queries.integration.test.ts` (add a case if the file doesn't exist yet, else extend it)

**Interfaces:**
- Changes: `CustomerDTO.phone` becomes `string | null` (was `string`) — every consumer of `CustomerDTO`/`customerSchema` across `features/customers/` and `features/subscriptions/` (the profile header's supplier/badge logic doesn't touch phone, only the customer table/drawer do) needs the type change to compile.

- [ ] **Step 1: Modify `prisma/schema.prisma`**

Read the file first. Change `Customer.phone`:

```prisma
model Customer {
  id             String   @id @default(uuid(7))
  name           String
  phone          String?
  // ...resto inalterado
}
```

- [ ] **Step 2: Migration SQL**

```bash
mkdir -p prisma/migrations/00000000000003_customer_phone_optional
```

`prisma/migrations/00000000000003_customer_phone_optional/migration.sql`:

```sql
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;
```

(The existing `UNIQUE` index on `phone` already tolerates multiple `NULL` values in Postgres — no index change needed, confirm this empirically in Step 5.)

- [ ] **Step 3: Apply**

```bash
docker compose up -d db
pnpm db:migrate
pnpm dlx prisma generate
```

- [ ] **Step 4: Update `src/features/customers/schema.ts`**

Read the file first. Change:

```ts
phone: z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido.'),
```

to:

```ts
phone: z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido.').optional().or(z.literal('')),
```

- [ ] **Step 5: Verify multiple-NULL uniqueness empirically**

```bash
docker exec mt-conexoes-db psql -U mtconexoes -d mtconexoes -c "
  INSERT INTO customers (id, name, phone, \"createdAt\", \"updatedAt\") VALUES ('test-null-1', 'Teste Null 1', NULL, now(), now());
  INSERT INTO customers (id, name, phone, \"createdAt\", \"updatedAt\") VALUES ('test-null-2', 'Teste Null 2', NULL, now(), now());
  DELETE FROM customers WHERE id IN ('test-null-1', 'test-null-2');
"
```

Expected: both `INSERT`s succeed (two customers with `NULL` phone coexist without a unique-constraint violation), then the cleanup `DELETE` removes them. If the second `INSERT` fails, the unique index isn't behaving as expected and needs investigation before continuing.

- [ ] **Step 6: `pnpm typecheck` — fix every resulting type error**

```bash
pnpm typecheck
```

Expected: TypeScript will flag every place that assumed `CustomerDTO.phone`/`customer.phone` is a non-null `string` (likely `customer-table.tsx`'s `<p>{row.phone}</p>` mono display, `customer-drawer.tsx`'s `values: customer ? { phone: customer.phone, ... }` line, possibly `customer-profile-header.tsx` if it touches phone at all — read each error and fix in place: display `row.phone ?? '—'`, form default `customer.phone ?? ''`). This step's actual diff depends on what `tsc` reports — don't guess ahead, fix what it flags.

- [ ] **Step 7: Add a test proving search tolerates a customer with `phone: null`**

Find (or create) `src/features/customers/queries.integration.test.ts`. Add:

```ts
it('busca por nome não quebra quando algum cliente não tem telefone', async () => {
  await db.customer.create({ data: { name: 'Sem Telefone Teste', phone: null } });
  const { rows } = await listCustomers({ page: 1, perPage: 8, q: 'Sem Telefone Teste' });
  expect(rows).toHaveLength(1);
  expect(rows[0].phone).toBeNull();
  await db.customer.deleteMany({ where: { name: 'Sem Telefone Teste' } });
});
```

Adjust imports/setup to match whatever pattern the file already uses (or, if creating fresh, mirror `suppliers`/`plans` query integration test structure if one exists — check first).

- [ ] **Step 8: Full verify + commit**

```bash
pnpm typecheck && pnpm lint && pnpm build
pnpm test:integration -- customers
```

```bash
git add prisma src/features/customers
git commit -m "feat(customers): make phone optional, no WhatsApp in real data"
```

---

### Task 3: `createImportedSubscription` — service function that bypasses `firstDueDate`

**Files:**
- Modify: `src/features/subscriptions/service.ts`

**Interfaces:**
- Consumes: `db`, `encrypt` (`@/lib/crypto`).
- Produces: `createImportedSubscription(params: { customerId: string; supplierId: string; priceCents: bigint; costCents: bigint; nextDueAt: Date; startedAt: Date; accessUsername: string | null; accessPassword: string | null; screens: number }): Promise<{ id: string }>`, `findImportedSubscriptionBySupplier(params: { supplierId: string; accessUsername: string }): Promise<{ id: string } | null>` — Task 4 depends on both exact signatures. Note the SECOND function no longer takes `customerId` — idempotency is checked by `supplierId`+`accessUsername` alone, BEFORE any `Customer` is resolved (a null phone can't be used to look up an existing customer first).

- [ ] **Step 1: Read the current file first**, then append (don't touch `createSubscription`/`updateSubscription`/`revealCredential` — additive only):

```ts
/**
 * Criação de assinatura pela importação da base — única exceção no app que
 * NÃO calcula `nextDueAt` via `firstDueDate`. A planilha de origem só tem o
 * vencimento atual (controlado na mão pelo cliente), nunca um histórico de
 * pagamento — decisão registrada em docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md.
 * A partir do primeiro pagamento registrado no sistema novo, a regra normal
 * (pagamento → próximo vencimento) passa a valer.
 */
export async function createImportedSubscription(params: {
  customerId: string;
  supplierId: string;
  priceCents: bigint;
  costCents: bigint;
  nextDueAt: Date;
  startedAt: Date;
  accessUsername: string | null;
  accessPassword: string | null;
  screens: number;
}): Promise<{ id: string }> {
  return db.subscription.create({
    data: {
      customerId: params.customerId,
      supplierId: params.supplierId,
      priceCents: params.priceCents,
      costCents: params.costCents,
      cycle: 'MONTHLY',
      nextDueAt: params.nextDueAt,
      startedAt: params.startedAt,
      accessUsername: params.accessUsername,
      accessPasswordEnc: params.accessPassword ? encrypt(params.accessPassword, 'subscription.accessPassword') : null,
      screens: params.screens,
    },
    select: { id: true },
  });
}

/**
 * Idempotência da importação — checado ANTES de tocar em `Customer`, porque
 * telefone nulo não serve de chave de upsert (`WHERE phone IS NULL` bateria
 * em qualquer cliente sem telefone, não no cliente certo desta linha).
 */
export async function findImportedSubscriptionBySupplier(params: {
  supplierId: string;
  accessUsername: string;
}): Promise<{ id: string } | null> {
  return db.subscription.findFirst({
    where: { supplierId: params.supplierId, accessUsername: params.accessUsername },
    select: { id: true },
  });
}
```

- [ ] **Step 2: Verify**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/features/subscriptions/service.ts
git commit -m "feat(subscriptions): add import-only subscription creation path"
```

---

### Task 4: Main script — `scripts/import-customers.ts`

**Files:**
- Create: `scripts/import-customers.ts`

**Interfaces:**
- Consumes: `normalizePhoneBR`/`parseCentsFromBR`/`parseDateBR` (Task 1), `createImportedSubscription`/`findImportedSubscriptionBySupplier` (Task 3), `db` (`@/lib/db`). Does NOT use `createCustomer` from `features/customers/service` — that function's `toData` assumes phone comes through `customerSchema` validation with the required-string shape pre-Task-2; the import script upserts/creates `Customer` directly via Prisma instead, since it needs `where: { phone }` conditionally (only when phone is present) which doesn't fit that service function's shape.

- [ ] **Step 1: Write the script**

```ts
/**
 * Importa clientes de uma planilha .xlsx/.xlsm (um arquivo por fornecedor)
 * pra base do sistema. Uso:
 *
 *   pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"
 *
 * Mapeamento de coluna confirmado contra o arquivo real
 * (Planilha para cadastro de Clientes UNIPLAY 2026.xlsm) — documentado em
 * docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md. Ajuste o
 * objeto COLUMN abaixo se um fornecedor diferente usar nomes de coluna
 * diferentes.
 */
import { writeFileSync } from 'node:fs';
import { readFile, utils } from 'xlsx';
import { config } from 'dotenv';
import { db } from '@/lib/db';
import { createImportedSubscription, findImportedSubscriptionBySupplier } from '@/features/subscriptions/service';
import { normalizePhoneBR, parseCentsFromBR, parseDateBR } from './import/parse-row';

config({ path: '.env.local' });

// Nomes de coluna confirmados contra o arquivo real. `trim()` aplicado na
// hora de ler o cabeçalho — a planilha real tem espaço em branco em alguns
// nomes (" VALOR ", "  WHATSAPP").
const COLUMN = {
  name: ['CODIGO', 'CÓDIGO', 'NOME'],
  phone: ['WHATSAPP', 'TELEFONE', 'CONTATO'],
  username: ['USUARIO', 'USUÁRIO'],
  password: ['SENHA'],
  startedAt: ['CRIAÇÃO', 'CRIACAO', 'DATA DE CRIAÇÃO'],
  dueDate: ['VALIDADE', 'VENCIMENTO', 'DATA DE VENCIMENTO'],
  screens: ['TELAS'],
  cost: ['CUSTO'],
  price: ['VALOR'],
} as const;

function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toUpperCase()] = value;
  }
  return normalized;
}

function pick(row: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

interface ImportResult {
  status: 'imported' | 'skipped' | 'rejected';
  identifier: string;
  reason?: string;
  priceCents?: bigint;
}

async function importRow(rawRow: Record<string, unknown>, supplierId: string): Promise<ImportResult> {
  const row = normalizeHeaders(rawRow);

  const rawName = pick(row, COLUMN.name);
  const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();
  const identifier = name || '(sem nome)';

  if (!name) return { status: 'rejected', identifier, reason: 'Nome ausente.' };

  const rawDue = pick(row, COLUMN.dueDate);
  const dueDate = rawDue !== undefined ? parseDateBR(rawDue as string | number | Date) : null;
  if (!dueDate) return { status: 'rejected', identifier, reason: 'Data de vencimento ausente ou inválida.' };

  const rawPrice = pick(row, COLUMN.price);
  const priceCents = rawPrice !== undefined ? parseCentsFromBR(rawPrice as string | number) : null;
  if (priceCents === null) return { status: 'rejected', identifier, reason: 'Valor do serviço ausente, inválido ou negativo.' };

  const rawCost = pick(row, COLUMN.cost);
  const costCents = rawCost !== undefined ? (parseCentsFromBR(rawCost as string | number) ?? 0n) : 0n;

  const rawStarted = pick(row, COLUMN.startedAt);
  const startedAt = rawStarted !== undefined ? (parseDateBR(rawStarted as string | number | Date) ?? new Date()) : new Date();

  const rawUsername = pick(row, COLUMN.username);
  const username = rawUsername !== undefined ? String(rawUsername).trim() || null : null;

  const rawPassword = pick(row, COLUMN.password);
  const password = rawPassword !== undefined ? String(rawPassword).trim() || null : null;

  const screensRaw = pick(row, COLUMN.screens);
  const screens = typeof screensRaw === 'number' ? Math.max(1, Math.floor(screensRaw)) : 1;

  const rawPhone = pick(row, COLUMN.phone);
  const phone = typeof rawPhone === 'string' ? normalizePhoneBR(rawPhone) : null;
  const phoneNoteSuffix = rawPhone && !phone ? ' (telefone informado mas inválido, importado sem telefone)' : '';

  // Idempotência checada ANTES de criar/tocar em Customer — ver Task 3.
  if (username) {
    const existing = await findImportedSubscriptionBySupplier({ supplierId, accessUsername: username });
    if (existing) return { status: 'skipped', identifier };
  }

  const customer = phone
    ? await db.customer.upsert({ where: { phone }, update: {}, create: { name, phone } })
    : await db.customer.create({ data: { name, phone: null } });

  await createImportedSubscription({
    customerId: customer.id,
    supplierId,
    priceCents,
    costCents,
    nextDueAt: dueDate,
    startedAt,
    accessUsername: username,
    accessPassword: password,
    screens,
  });

  return { status: 'imported', identifier: identifier + phoneNoteSuffix, priceCents };
}

async function main() {
  const [, , filePath, supplierName] = process.argv;
  if (!filePath || !supplierName) {
    console.error('Uso: pnpm import:customers <arquivo.xlsx-ou-xlsm> "<Nome do Fornecedor>"');
    process.exit(1);
  }

  const workbook = readFile(filePath, { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });

  const supplier = await db.supplier.upsert({
    where: { name: supplierName },
    update: {},
    create: { name: supplierName },
  });

  const results: ImportResult[] = [];
  for (const row of rows) {
    results.push(await importRow(row, supplier.id));
  }

  const imported = results.filter((r) => r.status === 'imported');
  const skipped = results.filter((r) => r.status === 'skipped');
  const rejected = results.filter((r) => r.status === 'rejected');
  const importedTotalCents = imported.reduce((sum, r) => sum + (r.priceCents ?? 0n), 0n);

  const reportLines = [
    `Importação — ${supplierName} — ${new Date().toISOString()}`,
    `Total de linhas: ${rows.length}`,
    `Importadas: ${imported.length}`,
    `Puladas (já existiam): ${skipped.length}`,
    `Recusadas: ${rejected.length}`,
    `Soma importada: R$ ${(Number(importedTotalCents) / 100).toFixed(2)}`,
    '',
    'Recusadas:',
    ...rejected.map((r) => `  - ${r.identifier}: ${r.reason}`),
  ];

  const reportPath = `import-report-${Date.now()}.txt`;
  writeFileSync(reportPath, reportLines.join('\n'));
  console.log(reportLines.join('\n'));
  console.log(`\nRelatório salvo em ${reportPath}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error('[import] falhou:', err);
  process.exit(1);
});
```

⚠️ Note the report intentionally never logs `accessPassword`/`accessUsername` — only `identifier` (customer name, plus an optional non-sensitive note about a malformed phone) and rejection `reason`. Verify this holds when you write the file.

⚠️ **Desconto continua fora do escopo desta etapa** — a coluna `DESCONTO` existe na planilha real mas só teve valor `0` nas 28 linhas recebidas; sem confirmação do formato (%/R$) pros casos não-zero, não é importado. Operador adiciona manualmente via o drawer de assinatura (1b) se algum cliente tiver desconto.

- [ ] **Step 2: Add `pnpm import:customers` script**

Read `package.json`'s `scripts` block first, add:

```json
"import:customers": "tsx scripts/import-customers.ts"
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add scripts/import-customers.ts package.json
git commit -m "feat(import): add main customer import script"
```

---

### Task 5: Integration test — fake `.xlsx` fixture, dedupe, no-phone case, idempotency, report

**Files:**
- Create: `scripts/import-customers.integration.test.ts`
- Create: `scripts/import/__fixtures__/generate-fixture.ts`

**Interfaces:** none new — exercises Tasks 1-4 end to end.

- [ ] **Step 1: Write `scripts/import/__fixtures__/generate-fixture.ts`**

```ts
import { utils, write } from 'xlsx';

export function buildFixtureWorkbook(rows: Record<string, unknown>[]): Buffer {
  const sheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'IPTV');
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
```

- [ ] **Step 2: Write `scripts/import-customers.integration.test.ts`**

Column names in the fixture match the REAL format (uppercase, as confirmed against the client's
file) — not the originally-assumed pt-BR long-form names:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';
import { buildFixtureWorkbook } from './import/__fixtures__/generate-fixture';

const SUPPLIER_NAME = 'Fornecedor Teste Importação';
const FIXTURE_PATH = '/tmp/import-fixture-test.xlsx';

const ROWS = [
  {
    CODIGO: 'Maria Teste Import',
    WHATSAPP: '(11) 98888-7777',
    USUARIO: 'maria.import',
    SENHA: 123456, // planilha real guarda senha como número
    'CRIAÇÃO': new Date('2024-01-01'),
    VALIDADE: new Date('2026-08-10'),
    TELAS: 2,
    CUSTO: '20,00',
    VALOR: '50,00',
  },
  {
    // sem WhatsApp — não é mais motivo de recusa, cria Customer sem telefone
    CODIGO: 'Cliente Sem Telefone',
    USUARIO: 'sem.telefone',
    SENHA: 654321,
    VALIDADE: new Date('2026-08-15'),
    VALOR: '30,00',
  },
  {
    // sem nome — recusada
    CODIGO: '',
    VALIDADE: new Date('2026-08-10'),
    VALOR: '50,00',
  },
];

async function cleanup() {
  await db.subscription.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await db.customer.deleteMany({ where: { phone: '+5511988887777' } });
  await db.customer.deleteMany({ where: { name: 'Cliente Sem Telefone' } });
  await db.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
  for (const file of readdirSync('.')) {
    if (file.startsWith('import-report-')) unlinkSync(file);
  }
}

beforeEach(cleanup);
afterEach(async () => {
  await cleanup();
  try { unlinkSync(FIXTURE_PATH); } catch { /* já removido */ }
});

describe('import-customers script', () => {
  it('importa com e sem telefone, recusa linha inválida, é idempotente', async () => {
    writeFileSync(FIXTURE_PATH, buildFixtureWorkbook(ROWS));

    const run = () => execSync(`pnpm tsx scripts/import-customers.ts ${FIXTURE_PATH} "${SUPPLIER_NAME}"`, { encoding: 'utf8' });

    const firstOutput = run();
    expect(firstOutput).toContain('Importadas: 2');
    expect(firstOutput).toContain('Recusadas: 1');

    const withPhone = await db.customer.findUnique({ where: { phone: '+5511988887777' } });
    expect(withPhone?.name).toBe('Maria Teste Import');

    const withoutPhone = await db.customer.findFirst({ where: { name: 'Cliente Sem Telefone' } });
    expect(withoutPhone?.phone).toBeNull();

    const subscription = await db.subscription.findFirst({ where: { customerId: withPhone!.id } });
    expect(subscription?.priceCents.toString()).toBe('5000');
    expect(subscription?.costCents.toString()).toBe('2000');
    expect(subscription?.nextDueAt.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(subscription?.accessUsername).toBe('maria.import');

    // Segunda rodada — mesmo arquivo, não duplica (checado por accessUsername+fornecedor)
    const secondOutput = run();
    expect(secondOutput).toContain('Puladas (já existiam): 2');

    const count = await db.subscription.count({ where: { customerId: withPhone!.id } });
    expect(count).toBe(1);
  }, 30_000);
});
```

- [ ] **Step 3: Run to verify**

```bash
docker compose up -d db
pnpm test:integration -- import-customers
```

Expected: PASS. If a fixture value mismatches (e.g. phone normalization, date round-trip through `cellDates: true`), adjust the fixture or the parsing/script code based on which one is actually wrong — don't force the test green by weakening an assertion.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-customers.integration.test.ts scripts/import/__fixtures__
git commit -m "test(import): add end-to-end fixture test for import script"
```

---

### Task 6: Final verification pass — including a real-file dry run

**Files:** none created — this task only runs checks.

- [ ] **Step 1: Full gate**

```bash
docker compose up -d db
pnpm test
pnpm test:integration
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Dry run against the REAL file**

```bash
pnpm import:customers "/Users/carloshenrique/Downloads/Planilha para cadastro de Clientes UNIPLAY 2026.xlsm" "Uniplay"
cat import-report-*.txt
```

Expected: report shows 28 linhas lidas, a maioria (idealmente todas) importadas — nenhuma recusada só por falta de telefone (isso seria um regression indicator that the phone-optional logic isn't actually wired correctly). Read the actual report output and sanity-check a couple of rows against the source file (open it, compare one or two customer names/values). If anything looks wrong, fix the script — don't just note it and move on, this is the one artifact directly checked against real client data.

Leave the imported test data in the dev database (it's the actual intended import, not throwaway) — do NOT delete it as part of cleanup, unlike the fixture test's data.

- [ ] **Step 3: Spot-check one imported customer through the UI**

```bash
pnpm dev &
sleep 3
```

Log in (seeded admin user), navigate to `/customers`, confirm at least one Uniplay customer appears with the right due date, open its ficha, confirm the subscription shows the right plan-less price/cost, click "Revelar" on the credential and confirm the password matches what's in the source spreadsheet for that row.

```bash
kill %1
```

- [ ] **Step 4: Update `docs/projeto/tecnico/07-plano-de-entrega.md`**

Check off "Importação da base atual" under Etapa 1. This closes Etapa 1 entirely (1a + 1b + 1c all done).

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off Etapa 1c import item, close out Etapa 1"
```

---

## Self-review notes

- **Spec coverage:** parsing utilities (Task 1, done pre-revision), `Customer.phone` optional migration + cascading fixes (Task 2, new), import-only subscription path (Task 3), main script matching the real column format (Task 4), end-to-end test covering both with-phone and without-phone paths (Task 5), verification including a dry run against the actual client file (Task 6). All spec sections — including the phone-optional decision — have a task.
- **Explicitly flagged as provisional:** `DESCONTO` import remains out of scope, same reasoning as the original plan, now confirmed against the real file (column exists, always zero in the sample, format for non-zero values still unconfirmed).
- **Type consistency checked:** `findImportedSubscriptionBySupplier`'s signature (Task 3) dropped `customerId` compared to the original plan's `findImportedSubscription` — Task 4's `importRow` calls it BEFORE resolving `Customer`, matching the corrected idempotency ordering from the spec. `createImportedSubscription`'s signature is unchanged from the original plan.
- **Idempotency mechanism re-verified for the phone-optional case:** Task 5's test explicitly covers a no-phone row across two runs — the original plan's test only covered the with-phone path, which would have silently passed even if the no-phone idempotency check were broken.
