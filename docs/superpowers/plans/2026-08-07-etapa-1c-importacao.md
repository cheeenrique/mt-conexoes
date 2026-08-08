# Etapa 1c — Importação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Script `scripts/import-customers.ts` que lê um `.xlsx` (um arquivo por fornecedor), consolida clientes por telefone, cria `Customer`/`Subscription` usando o vencimento da planilha diretamente (sem calcular via `firstDueDate`), recusa linha inválida com motivo, é idempotente, e produz relatório com totais.

**Architecture:** Script standalone, mesmo padrão de `prisma/seed.ts` — Prisma direto, sem Server Action, sem sessão HTTP, roda via `tsx`. Reaproveita `lib/crypto.ts` (encrypt de senha) e as constraints do banco (unique de `Customer.phone`) pra idempotência/dedupe. **Não** reaproveita `features/subscriptions/service.ts#createSubscription` porque essa função calcula `nextDueAt` via `firstDueDate` — a importação usa o vencimento dado, decisão registrada na spec.

**Tech Stack:** `xlsx` (nova dependência, só usada neste script — não entra no bundle do app), Prisma, `tsx`, `@node-rs/argon2` não é usado aqui (só `lib/crypto.ts` pra senha de acesso).

## Global Constraints

- Vencimento (`nextDueAt`) da planilha vai **direto** pro banco — nunca recalculado via `firstDueDate`/`nextDueDate` na importação (decisão registrada na spec, diferente da regra normal do app).
- `BigInt` em centavos pra `priceCents`/`costCents`, conversão de reais (`R$ 1.234,56` ou `1234.56` ou `1234,56`) pra centavos com round half up, uma vez, sem passar por float intermediário evitável (usar `decimal.js`, já dependência do projeto, ou aritmética em string).
- Senha de acesso criptografada com `lib/crypto.ts#encrypt(valor, 'subscription.accessPassword')` antes de qualquer persistência — nunca gravar em claro, nunca logar o valor.
- Telefone normalizado pra E.164 (`+55` + DDD + número, 10 ou 11 dígitos) — mesma regex de `customerSchema.phone` (`^\+55\d{10,11}$`), pra consistência com o que a tela de Clientes aceita.
- Linha inválida é **recusada com motivo**, nunca importada com valor chutado.
- Idempotente: rodar o mesmo arquivo duas vezes não duplica `Subscription`.
- Sem `console.log` de dado sensível (senha em claro nunca aparece no relatório nem no console).
- Commits: Conventional Commits, subject ≤72 chars — contar caracteres antes de usar qualquer mensagem sugerida.

---

### Task 1: Dependência `xlsx` + utilitários de parsing (telefone, dinheiro, data)

**Files:**
- Modify: `package.json` (add `xlsx` dependency)
- Create: `scripts/import/parse-row.ts`
- Create: `scripts/import/parse-row.test.ts`

**Interfaces:**
- Produces: `normalizePhoneBR(raw: string): string | null` (retorna E.164 ou `null` se impossível normalizar), `parseCentsFromBR(raw: string | number): bigint | null` (aceita "R$ 1.234,56", "1234.56", "1234,56", número puro; retorna `null` se não parseável ou negativo), `parseDateBR(raw: string | number | Date): Date | null` (aceita string "DD/MM/AAAA" e datas seriais do Excel, que a lib `xlsx` já converte pra `Date` quando a célula é formatada como data — cobrir os dois casos).
- Consumed by: Task 3's main script.

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

  // Já com código do país
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  // DDD + número (10 ou 11 dígitos: fixo 8 dígitos ou celular 9 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  // Sem DDD (7 ou 8 dígitos) — impossível recuperar o DDD, recusa.
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

  // Detecta formato: se tem vírgula E ponto, o último separador é o decimal.
  // Se só tem vírgula, vírgula é decimal (BR). Se só tem ponto, ponto é decimal (US/número puro).
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
  if (typeof raw === 'number') return null; // serial numérico não tratado aqui — xlsx já resolve células-data como Date

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  // Valida que a data não "estourou" (ex.: 32/13 vira outro mês/ano em JS puro)
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

### Task 2: `createImportedSubscription` — service function that bypasses `firstDueDate`

**Files:**
- Modify: `src/features/subscriptions/service.ts`

**Interfaces:**
- Consumes: `db`, `encrypt` (`@/lib/crypto`).
- Produces: `createImportedSubscription(params: { customerId: string; supplierId: string; priceCents: bigint; costCents: bigint; nextDueAt: Date; startedAt: Date; accessUsername: string | null; accessPassword: string | null; screens: number }): Promise<{ id: string }>` — Task 3 depends on this exact signature.

- [ ] **Step 1: Read the current file first**, then append this function (don't touch `createSubscription`/`updateSubscription`/`revealCredential` — additive only):

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

/** Pra idempotência da importação: já existe assinatura desse cliente+fornecedor+usuário? */
export async function findImportedSubscription(params: {
  customerId: string;
  supplierId: string;
  accessUsername: string | null;
}): Promise<{ id: string } | null> {
  if (!params.accessUsername) return null;
  return db.subscription.findFirst({
    where: { customerId: params.customerId, supplierId: params.supplierId, accessUsername: params.accessUsername },
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

### Task 3: Main script — `scripts/import-customers.ts`

**Files:**
- Create: `scripts/import-customers.ts`

**Interfaces:**
- Consumes: `normalizePhoneBR`/`parseCentsFromBR`/`parseDateBR` (Task 1), `createImportedSubscription`/`findImportedSubscription` (Task 2), `createCustomer` (`@/features/customers/service` — reused as-is, no changes needed there), `db` (`@/lib/db`).

- [ ] **Step 1: Write the script**

```ts
/**
 * Importa clientes de uma planilha .xlsx (um arquivo por fornecedor) pra
 * base do sistema. Uso:
 *
 *   pnpm import:customers <arquivo.xlsx> "<Nome do Fornecedor>"
 *
 * Mapeamento de coluna documentado em
 * docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md — ajuste
 * o objeto COLUMN abaixo se os nomes da planilha real vierem diferentes.
 */
import { writeFileSync } from 'node:fs';
import { readFile, utils } from 'xlsx';
import { config } from 'dotenv';
import { db } from '@/lib/db';
import { createCustomer } from '@/features/customers/service';
import { createImportedSubscription, findImportedSubscription } from '@/features/subscriptions/service';
import { normalizePhoneBR, parseCentsFromBR, parseDateBR } from './import/parse-row';

config({ path: '.env.local' });

// Nomes de coluna assumidos com base no resumo do vídeo do cliente — ajustar
// aqui (não em outro lugar) quando o arquivo real chegar.
const COLUMN = {
  name: ['Código', 'Nome', 'Nome do Cliente', 'Código / Nome do Cliente'],
  phone: ['Contato', 'WhatsApp', 'Contato (WhatsApp)', 'Telefone'],
  username: ['Usuário', 'Usuario'],
  password: ['Senha'],
  startedAt: ['Data de Criação', 'Data de Criacao', 'Criação'],
  dueDate: ['Validade', 'Data de Vencimento', 'Vencimento'],
  screens: ['Telas'],
  cost: ['Custo'],
  price: ['Valor do Serviço', 'Valor', 'Valor do Servico'],
} as const;

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
}

async function importRow(row: Record<string, unknown>, supplierId: string): Promise<ImportResult> {
  const rawName = pick(row, COLUMN.name);
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  const identifier = name || '(sem nome)';

  if (!name) return { status: 'rejected', identifier, reason: 'Nome ausente.' };

  const rawPhone = pick(row, COLUMN.phone);
  const phone = typeof rawPhone === 'string' ? normalizePhoneBR(rawPhone) : null;
  if (!phone) return { status: 'rejected', identifier, reason: 'Telefone ausente ou impossível de normalizar.' };

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

  const username = typeof pick(row, COLUMN.username) === 'string' ? (pick(row, COLUMN.username) as string).trim() || null : null;
  const password = typeof pick(row, COLUMN.password) === 'string' ? (pick(row, COLUMN.password) as string).trim() || null : null;
  const screensRaw = pick(row, COLUMN.screens);
  const screens = typeof screensRaw === 'number' ? Math.max(1, Math.floor(screensRaw)) : 1;

  const customer = await db.customer.upsert({
    where: { phone },
    update: {},
    create: { name, phone },
  });

  const existing = await findImportedSubscription({ customerId: customer.id, supplierId, accessUsername: username });
  if (existing) return { status: 'skipped', identifier };

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

  return { status: 'imported', identifier };
}

async function main() {
  const [, , filePath, supplierName] = process.argv;
  if (!filePath || !supplierName) {
    console.error('Uso: pnpm import:customers <arquivo.xlsx> "<Nome do Fornecedor>"');
    process.exit(1);
  }

  const workbook = readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });

  const supplier = await db.supplier.upsert({
    where: { name: supplierName },
    update: {},
    create: { name: supplierName },
  });

  const results: ImportResult[] = [];
  let importedTotalCents = 0n;

  for (const row of rows) {
    const result = await importRow(row, supplier.id);
    results.push(result);
  }

  const imported = results.filter((r) => r.status === 'imported');
  const skipped = results.filter((r) => r.status === 'skipped');
  const rejected = results.filter((r) => r.status === 'rejected');

  const reportLines = [
    `Importação — ${supplierName} — ${new Date().toISOString()}`,
    `Total de linhas: ${rows.length}`,
    `Importadas: ${imported.length}`,
    `Puladas (já existiam): ${skipped.length}`,
    `Recusadas: ${rejected.length}`,
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

⚠️ Note the report intentionally never logs `accessPassword`/`accessUsername` — only `identifier` (customer name) and rejection `reason`. Verify this holds when you write the file — don't add fields later without checking this constraint again.

⚠️ **Desconto (`discountType`/`discountValue`) is deliberately NOT imported by this script**, even though the spec's column-mapping table lists it as "se presente" — the spec itself flags the % vs R$ heuristic as "ambíguo... a confirmar contra o arquivo real". Importing a wrongly-typed discount (treating a percentage as a fixed amount or vice versa) is worse than not importing it at all. The operator adds a discount manually via the existing Subscription drawer (1b) for the handful of customers who have one — cheaper and safer than guessing a format we haven't seen yet. Revisit only once the real file confirms the actual format.

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

### Task 4: Integration test — fake `.xlsx` fixture, dedupe, idempotency, report

**Files:**
- Create: `scripts/import-customers.integration.test.ts`
- Create: `scripts/import/__fixtures__/generate-fixture.ts` (helper to build a fake `.xlsx` in-memory for the test, not a static binary file committed to the repo)

**Interfaces:** none new — exercises Tasks 1-3 end to end.

- [ ] **Step 1: Write `scripts/import/__fixtures__/generate-fixture.ts`**

```ts
import { utils, write } from 'xlsx';

export function buildFixtureWorkbook(rows: Record<string, unknown>[]): Buffer {
  const sheet = utils.json_to_sheet(rows);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'Clientes');
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
```

- [ ] **Step 2: Write `scripts/import-customers.integration.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { db } from '@/lib/db';
import { buildFixtureWorkbook } from './import/__fixtures__/generate-fixture';

const SUPPLIER_NAME = 'Fornecedor Teste Importação';
const FIXTURE_PATH = '/tmp/import-fixture-test.xlsx';

const VALID_ROWS = [
  {
    'Código / Nome do Cliente': 'Maria Teste Import',
    'Contato (WhatsApp)': '(11) 98888-7777',
    Usuário: 'maria.import',
    Senha: 'senha-real-123',
    'Data de Criação': '01/01/2024',
    'Data de Vencimento': '10/08/2026',
    Telas: 2,
    Custo: '20,00',
    'Valor do Serviço': '50,00',
  },
  {
    // sem telefone válido — deve ser recusada
    'Código / Nome do Cliente': 'Linha Inválida',
    'Contato (WhatsApp)': '9999-8888',
    'Data de Vencimento': '10/08/2026',
    'Valor do Serviço': '50,00',
  },
];

async function cleanup() {
  await db.subscription.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await db.customer.deleteMany({ where: { phone: '+5511988887777' } });
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
  it('importa linha válida, recusa linha inválida, é idempotente', async () => {
    writeFileSync(FIXTURE_PATH, buildFixtureWorkbook(VALID_ROWS));

    const run = () => execSync(`pnpm tsx scripts/import-customers.ts ${FIXTURE_PATH} "${SUPPLIER_NAME}"`, { encoding: 'utf8' });

    const firstOutput = run();
    expect(firstOutput).toContain('Importadas: 1');
    expect(firstOutput).toContain('Recusadas: 1');

    const customer = await db.customer.findUnique({ where: { phone: '+5511988887777' } });
    expect(customer?.name).toBe('Maria Teste Import');

    const subscription = await db.subscription.findFirst({ where: { customerId: customer!.id } });
    expect(subscription?.priceCents.toString()).toBe('5000');
    expect(subscription?.costCents.toString()).toBe('2000');
    expect(subscription?.nextDueAt.toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(subscription?.accessUsername).toBe('maria.import');

    // Segunda rodada — mesmo arquivo, não duplica
    const secondOutput = run();
    expect(secondOutput).toContain('Puladas (já existiam): 1');

    const count = await db.subscription.count({ where: { customerId: customer!.id } });
    expect(count).toBe(1);
  }, 30_000);
});
```

- [ ] **Step 3: Run to verify**

```bash
docker compose up -d db
pnpm test:integration -- import-customers
```

Expected: PASS. If the fixture's expected values mismatch (e.g. phone normalization edge case), adjust the fixture or the parsing function based on which one is actually wrong — don't force the test green by weakening an assertion.

- [ ] **Step 4: Commit**

```bash
git add scripts/import-customers.integration.test.ts scripts/import/__fixtures__
git commit -m "test(import): add end-to-end fixture test for import script"
```

---

### Task 5: Final verification pass

**Files:** none created — this task only runs checks.

- [ ] **Step 1: Full gate**

```bash
docker compose up -d db
pnpm test
pnpm test:integration
pnpm typecheck && pnpm lint && pnpm build
```

- [ ] **Step 2: Manual dry run against a hand-built fixture (not the fake test one) to eyeball the report format**

```bash
node -e "
const { utils, writeFile } = require('xlsx');
const rows = [{ 'Código / Nome do Cliente': 'Cliente Manual', 'Contato (WhatsApp)': '11977776666', 'Data de Vencimento': '15/08/2026', 'Valor do Serviço': '45,90' }];
const sheet = utils.json_to_sheet(rows);
const wb = utils.book_new();
utils.book_append_sheet(wb, sheet, 'Clientes');
writeFile(wb, '/tmp/manual-check.xlsx');
"
pnpm import:customers /tmp/manual-check.xlsx "Fornecedor Manual Check"
cat import-report-*.txt
rm -f /tmp/manual-check.xlsx import-report-*.txt
```

Expected: report shows 1 imported, 0 rejected, sum matches R$ 45,90.

- [ ] **Step 3: Update `docs/projeto/tecnico/07-plano-de-entrega.md`**

Check off "Importação da base atual" under Etapa 1. This closes Etapa 1 entirely (1a + 1b + 1c all done) — also update the etapa's overall "Critério de pronto" line if it's currently unchecked as a whole.

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off Etapa 1c import item, close out Etapa 1"
```

---

## Self-review notes

- **Spec coverage:** column mapping + parsing utilities (Task 1), import-only subscription path bypassing `firstDueDate` (Task 2), main script with dedup/idempotency/report (Task 3), end-to-end test (Task 4), verification (Task 5). All spec sections have a task.
- **Explicitly flagged as provisional:** the `COLUMN` mapping in Task 3 is documented as assumed, adjustable when the real file arrives — this is not a silent gap, the spec and the script's own header comment both say so.
- **Type consistency checked:** `createImportedSubscription`'s parameter shape (Task 2) matches exactly what `importRow` (Task 3) constructs. `normalizePhoneBR`/`parseCentsFromBR`/`parseDateBR` signatures (Task 1) match their usage in Task 3 verbatim.
- **Idempotency mechanism is explicit and testable:** `findImportedSubscription` keyed on `customerId`+`supplierId`+`accessUsername` — Task 4's test exercises the exact double-run scenario the spec's "critério de pronto" names.
