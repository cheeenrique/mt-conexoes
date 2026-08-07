# Etapa 0 — Fundação + Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap `mt-conexoes` (Next.js painel) with local docker infra (Postgres + cron simulator), the pure `core/` primitives (money, dates), auth, crypto, and a design system (tokens + reusable form/table/layout components) that every future feature builds on. No CRUD screen for a business entity is built here — that starts at Etapa 1.

**Architecture:** Next.js App Router single deployable, Prisma on Postgres, layered per `.claude/rules/01-arquitetura.md` (`app/ → features/ → core/, lib/`). Design tokens live in Tailwind config; reusable, domain-free pieces live in `components/ui/`; the app shell (sidebar/header) lives in `components/layout/`.

**Tech Stack:** Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · Prisma + Postgres 16 (Neon in prod, docker in dev) · Vitest · `date-fns` v4 + `@date-fns/tz` · `@node-rs/argon2` · `jose` (JWT) · `react-hook-form` + `zod` · `react-imask` · `sonner` · `decimal.js` · Docker Compose

## Global Constraints

- `BigInt` in cents, suffix `...Cents`, never `number`/`float`, not even temporarily. Percentual is `Decimal`.
- Rounding: round half up, in cents, once, at the end. Never `Math.round` on a float.
- `core/` is pure: no Prisma, no Next, no `process.env`, no `node:crypto`, no `new Date()`. The instant enters by parameter.
- `lib/` holds infra only (Prisma client, session, crypto, format, logger) — no business rule.
- Server Action ≤30 lines, only orchestrates: session, Zod validation, service call, revalidation.
- Every Server Action starts with `requireSession()` except `(auth)/login`'s own login action.
- Every input crosses a Zod schema at the boundary. No `z.any()`, `.passthrough()`.
- `BigInt` converts to `string` before crossing to a client component.
- Errors are data: `DomainError` subclasses with `code` + pt-BR `message` for the end user; re-throw always with `{ cause }`; never `catch { /* swallow */ }`.
- Logs: JSON to stdout, carries `requestId`/`userId`/`route or job`/`durationMs`/`status`; never a password, token, credential, full phone, or whole object.
- Table names `snake_case` plural via `@@map`; Prisma models `PascalCase` singular; money fields suffixed `Cents` (`BigInt`); date fields suffixed `At` (UTC `DateTime`); ids `uuid(7)`.
- Migrations are immutable; partial indexes and singleton rows go in as manual SQL (schema.prisma doesn't express them).
- Naming project-wide: `mt-conexoes`.
- Commits: Conventional Commits, subject ≤72 chars, body explains why.
- File/function budgets from `.claude/rules/01-arquitetura.md`: Server Action ≤30 lines, `service.ts` ≤250, function in `core/` ≤40, React component ≤150, `page.tsx` ≤100.

---

### Task 1: Repo scaffold — Next.js, TypeScript, Tailwind, shadcn/ui

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `tailwind.config.ts`, `components.json`, `.eslintrc.json` (or `eslint.config.mjs`), `.prettierrc`
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx` (temporary redirect to `/login`, replaced by Task 10)
- Create empty dirs (via `.gitkeep` where needed): `src/core/`, `src/lib/`, `src/features/`, `src/components/ui/`, `src/components/layout/`
- Modify: `.gitignore` (add `.next/`, `.env.local`)

**Interfaces:**
- Produces: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck` scripts in `package.json` that every later task assumes exist.

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/carloshenrique/Documents/PESSOAL/mt-conexoes
pnpm create next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint --no-turbopack --use-pnpm
```

Answer prompts to keep existing `docs/`, `.claude/`, `CLAUDE.md`, `README.md`, `.gitignore` untouched (don't overwrite).

- [ ] **Step 2: Add `typecheck` script and strict TS**

Edit `package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit"
  }
}
```

Confirm `tsconfig.json` has `"strict": true`.

- [ ] **Step 3: Init shadcn/ui with dark base**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input label
```

This creates `components.json` and `src/components/ui/button.tsx`, `input.tsx`, `label.tsx`. Token values get overridden in Task 13 — don't hand-tune colors here.

- [ ] **Step 4: Create layer directories**

```bash
mkdir -p src/core src/lib src/features src/components/layout
touch src/core/.gitkeep src/lib/.gitkeep src/features/.gitkeep
```

- [ ] **Step 5: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: both succeed, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with TypeScript, Tailwind, shadcn/ui"
```

---

### Task 2: Docker local — Postgres + cron simulator

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `Dockerfile`, `.dockerignore`
- Create: `docker/cron-sim/entrypoint.sh`

**Interfaces:**
- Produces: `DATABASE_URL=postgresql://mtconexoes:mtconexoes@localhost:5432/mtconexoes` reachable once `docker compose up -d db` is healthy — every later task with Prisma/Vitest integration depends on this.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: mt-conexoes-db
    environment:
      POSTGRES_USER: mtconexoes
      POSTGRES_PASSWORD: mtconexoes
      POSTGRES_DB: mtconexoes
    ports:
      - "5432:5432"
    volumes:
      - mt-conexoes-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mtconexoes -d mtconexoes"]
      interval: 5s
      timeout: 3s
      retries: 10

  cron-sim:
    image: node:20-alpine
    container_name: mt-conexoes-cron-sim
    depends_on:
      - db
    environment:
      APP_URL: http://host.docker.internal:3000
      CRON_SECRET: ${CRON_SECRET:-dev-cron-secret}
      CRON_ENDPOINTS: /api/cron/ping
      INTERVAL_SECONDS: "60"
    volumes:
      - ./docker/cron-sim/entrypoint.sh:/entrypoint.sh:ro
    entrypoint: ["sh", "/entrypoint.sh"]

volumes:
  mt-conexoes-db-data:
```

- [ ] **Step 2: Write the cron-sim loop script**

```bash
mkdir -p docker/cron-sim
```

`docker/cron-sim/entrypoint.sh`:

```sh
#!/bin/sh
set -eu
echo "[cron-sim] simulating Cloud Scheduler, hitting $APP_URL every ${INTERVAL_SECONDS}s"
while true; do
  for endpoint in $CRON_ENDPOINTS; do
    echo "[cron-sim] POST $APP_URL$endpoint"
    curl -s -o /dev/null -w "[cron-sim] %{url_effective} -> %{http_code}\n" \
      -X POST -H "Authorization: Bearer $CRON_SECRET" \
      "$APP_URL$endpoint" || echo "[cron-sim] app not reachable yet"
  done
  sleep "$INTERVAL_SECONDS"
done
```

```bash
chmod +x docker/cron-sim/entrypoint.sh
```

- [ ] **Step 3: `.env.example`**

```bash
# Postgres (docker-compose db service)
DATABASE_URL="postgresql://mtconexoes:mtconexoes@localhost:5432/mtconexoes"

# Session JWT signing (openssl rand -base64 32)
SESSION_SECRET="dev-session-secret-change-me-32-bytes-min"

# AES-256-GCM key for credentials, 32 bytes base64 (openssl rand -base64 32)
CREDENTIAL_KEY="ZGV2LWtleS1jaGFuZ2UtbWUtMzItYnl0ZXMtb2s="

# Dev-only bearer token the cron-sim container sends; production uses Cloud Scheduler OIDC instead
CRON_SECRET="dev-cron-secret"

NODE_ENV="development"
```

- [ ] **Step 4: `Dockerfile` (prod build, Cloud Run target — prepared, not deployed this task)**

```dockerfile
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["pnpm", "start"]
```

- [ ] **Step 5: `.dockerignore`**

```
node_modules
.next
.git
docs
docker
*.md
.env*
!.env.example
```

- [ ] **Step 6: Verify db comes up healthy**

Run: `docker compose up -d db && docker compose ps`
Expected: `db` service `STATUS` shows `healthy` within ~15s.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "build: add docker-compose with Postgres and cron simulator"
```

---

### Task 3: Vitest configuration (unit + integration)

**Files:**
- Create: `vitest.config.ts`, `vitest.integration.config.ts`, `tests/setup-integration.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `pnpm test` (unit, no I/O), `pnpm test:integration` (needs `db` container running), `pnpm test:all`.

- [ ] **Step 1: Install test deps**

```bash
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: `vitest.config.ts` (unit, jsdom, excludes `*.integration.test.ts`)**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.integration.test.{ts,tsx}'],
  },
});
```

- [ ] **Step 3: `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: `vitest.integration.config.ts` (node env, real Postgres)**

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup-integration.ts'],
    include: ['src/**/*.integration.test.ts'],
    testTimeout: 15000,
  },
});
```

`tests/setup-integration.ts`:

```ts
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido — suba `docker compose up -d db` e copie .env.example para .env.local');
}
```

- [ ] **Step 5: Add scripts**

```json
{
  "scripts": {
    "test": "vitest run --config vitest.config.ts",
    "test:watch": "vitest --config vitest.config.ts",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:all": "pnpm test && pnpm test:integration"
  }
}
```

- [ ] **Step 6: Verify empty run works**

```bash
cp .env.example .env.local
pnpm test
```

Expected: "No test files found" (or 0 tests, exit 0) — confirms wiring before Task 4 adds real tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: configure Vitest for unit and Postgres integration suites"
```

---

### Task 4: `core/money.ts` — money primitives (TDD)

**Files:**
- Create: `src/core/money.ts`, `src/core/money.test.ts`

**Interfaces:**
- Produces: `divRoundHalfUp(numerator: bigint, denominator: bigint): bigint`, `applyPercent(cents: bigint, percent: Decimal): bigint`, `marginPercent(revenueCents: bigint, costCents: bigint): Decimal | null` — consumed by `lib/format.ts` (Task 5) and every future money feature.

- [ ] **Step 1: Install `decimal.js`**

```bash
pnpm add decimal.js
```

- [ ] **Step 2: Write the failing tests**

`src/core/money.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { applyPercent, divRoundHalfUp, marginPercent } from './money';

describe('divRoundHalfUp', () => {
  it('arredonda 5/2 para cima (half up)', () => {
    expect(divRoundHalfUp(5n, 2n)).toBe(3n);
  });

  it('divide exato sem arredondar', () => {
    expect(divRoundHalfUp(4n, 2n)).toBe(2n);
  });

  it('R$ 100,00 dividido em 3 partes soma exatamente R$ 100,00', () => {
    const total = 10_000n;
    const parts = [
      divRoundHalfUp(total, 3n),
      divRoundHalfUp(total, 3n),
      total - 2n * divRoundHalfUp(total, 3n),
    ];
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(total);
  });
});

describe('applyPercent', () => {
  it('33,33% sobre 10000 centavos → 3333 centavos', () => {
    expect(applyPercent(10_000n, new Decimal('33.33'))).toBe(3333n);
  });

  it('50% sobre 1 centavo → 1 centavo (half up)', () => {
    expect(applyPercent(1n, new Decimal('50'))).toBe(1n);
  });
});

describe('marginPercent', () => {
  it('devolve null quando receita é zero, não divide por zero', () => {
    expect(marginPercent(0n, 0n)).toBeNull();
  });

  it('calcula margem em pontos percentuais', () => {
    const margin = marginPercent(10_000n, 6_000n)!;
    expect(margin.toNumber()).toBeCloseTo(40, 5);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- money`
Expected: FAIL — `src/core/money.ts` doesn't exist yet.

- [ ] **Step 4: Implement `src/core/money.ts`**

```ts
import Decimal from 'decimal.js';

/** Divisão com arredondamento half up. Numerador e denominador não-negativos. */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

/** Aplica um percentual sobre um valor em centavos. */
export function applyPercent(cents: bigint, percent: Decimal): bigint {
  const basisPoints = BigInt(percent.times(100).toFixed(0));
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

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- money`
Expected: PASS, all 6 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/core/money.ts src/core/money.test.ts
git commit -m "feat(core): add money primitives with round-half-up arithmetic"
```

---

### Task 5: `lib/format.ts` — currency formatting

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

**Interfaces:**
- Consumes: nothing from `core/` (formatting is presentation, not calculation — per `.claude/rules/05-reuso.md`).
- Produces: `formatCents(value: string | bigint): string` — every money-displaying component (Task 15 `CurrencyInput`, future feature tables) uses this, never hand-formats.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { formatCents } from './format';

describe('formatCents', () => {
  it('formata centavos como moeda BRL', () => {
    expect(formatCents('123456')).toBe('R$ 1.234,56');
  });

  it('aceita bigint diretamente', () => {
    expect(formatCents(100n)).toBe('R$ 1,00');
  });

  it('formata zero', () => {
    expect(formatCents(0n)).toBe('R$ 0,00');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- format`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function formatCents(value: string | bigint): string {
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const reais = Number(cents) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- format`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(lib): add formatCents for BRL currency display"
```

---

### Task 6: `core/dates.ts` — due date calculation with month-end clamp (TDD)

**Files:**
- Create: `src/core/dates.ts`, `src/core/dates.test.ts`

**Interfaces:**
- Produces: `resolveDueDay`, `endOfLocalDay`, `nextDueDate`, `firstDueDate`, `monthBoundsUtc`, `BillingCycle` type, `CYCLE_MONTHS` — every future billing feature (Etapa 2+) depends on these exact names.

- [ ] **Step 1: Install date libs**

```bash
pnpm add date-fns @date-fns/tz
```

- [ ] **Step 2: Write the failing tests**

`src/core/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { endOfLocalDay, firstDueDate, monthBoundsUtc, nextDueDate, resolveDueDay } from './dates';

const TZ = 'America/Sao_Paulo';

describe('resolveDueDay', () => {
  it('dia 31 em fevereiro comum vira 28', () => {
    expect(resolveDueDay(31, 2026, 1)).toBe(28); // month is 0-indexed: 1 = fevereiro
  });

  it('dia 31 em fevereiro bissexto vira 29', () => {
    expect(resolveDueDay(31, 2028, 1)).toBe(29);
  });

  it('dia 15 nunca muda', () => {
    expect(resolveDueDay(15, 2026, 1)).toBe(15);
  });
});

describe('nextDueDate — clamp de fim de mês', () => {
  it('pagou 31/01 → vence 28/02 (comum)', () => {
    const due = nextDueDate({ paidAt: new Date('2026-01-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-03-01T02:59:59.999Z'); // 28/02 23:59:59.999 -03:00
  });

  it('pagou 31/01 → vence 29/02 (bissexto 2028)', () => {
    const due = nextDueDate({ paidAt: new Date('2028-01-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2028-03-01T02:59:59.999Z'); // 29/02 23:59:59.999 -03:00
  });

  it('pagou 31/01, trimestral → vence 30/04', () => {
    const due = nextDueDate({ paidAt: new Date('2026-01-31T15:00:00Z'), cycle: 'QUARTERLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-05-01T02:59:59.999Z'); // 30/04 23:59:59.999 -03:00
  });

  it('pagou 28/02, depois pagou 28/03 → mantém dia 28, não sobe pra 31', () => {
    const due = nextDueDate({ paidAt: new Date('2026-03-28T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-04-28T02:59:59.999Z');
  });

  it('pagou dia 31 em janeiro, depois em março → volta a vencer 31', () => {
    const due = nextDueDate({ paidAt: new Date('2026-03-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-05-01T02:59:59.999Z'); // 30/04 (abril tem 30 dias)
  });

  it('pagou dia 1 → sempre dia 1', () => {
    const due = nextDueDate({ paidAt: new Date('2026-06-01T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-07-01T02:59:59.999Z');
  });

  it('semestral: pagou 31/08 → vence 28/02', () => {
    const due = nextDueDate({ paidAt: new Date('2026-08-31T15:00:00Z'), cycle: 'SEMIANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2027-03-01T02:59:59.999Z');
  });

  it('anual: pagou 29/02/2028 → vence 28/02/2029', () => {
    const due = nextDueDate({ paidAt: new Date('2028-02-29T15:00:00Z'), cycle: 'ANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2029-03-01T02:59:59.999Z');
  });

  it('anual atravessando virada de ano: pagou 15/12/2026 → vence 15/12/2027', () => {
    const due = nextDueDate({ paidAt: new Date('2026-12-15T15:00:00Z'), cycle: 'ANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2027-12-16T02:59:59.999Z');
  });
});

describe('firstDueDate', () => {
  it('assinatura criada 01/01, mensal → primeira cobrança vence 01/02', () => {
    const due = firstDueDate({ startedAt: new Date('2026-01-01T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-02-01T02:59:59.999Z');
  });
});

describe('fuso — janela de atraso', () => {
  it('vencimento em UTC corresponde a 23:59:59.999 local do dia 10', () => {
    const due = endOfLocalDay(2026, 7, 10, TZ); // agosto = mês 7 (0-indexed)
    expect(due.toISOString()).toBe('2026-08-11T02:59:59.999Z');
  });
});

describe('monthBoundsUtc', () => {
  it('agosto não inclui pagamento de 31/07 22:00 local', () => {
    const { from } = monthBoundsUtc(2026, 7, TZ);
    const payment = new Date('2026-08-01T01:00:00Z'); // 31/07 22:00 -03:00
    expect(payment.getTime() < from.getTime()).toBe(true);
  });

  it('agosto inclui pagamento de 31/08 22:00 local', () => {
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const payment = new Date('2026-09-01T01:00:00Z'); // 31/08 22:00 -03:00
    expect(payment.getTime() >= from.getTime() && payment.getTime() < to.getTime()).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- dates`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/core/dates.ts`**

```ts
import { addMonths, startOfMonth } from 'date-fns';
import { TZDate } from '@date-fns/tz';

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';

export const CYCLE_MONTHS: Record<BillingCycle, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  ANNUAL: 12,
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Dia efetivo do vencimento naquele mês, respeitando o dia desejado. */
export function resolveDueDay(desiredDay: number, year: number, month: number): number {
  return Math.min(desiredDay, daysInMonth(year, month));
}

/** 23:59:59.999 local convertido para UTC. */
export function endOfLocalDay(year: number, month: number, day: number, timezone: string): Date {
  const local = new TZDate(year, month, day, 23, 59, 59, 999, timezone);
  return new Date(local.getTime());
}

function computeDueDate(referenceLocal: TZDate, cycle: BillingCycle, timezone: string): Date {
  const target = addMonths(startOfMonth(referenceLocal), CYCLE_MONTHS[cycle]);
  const day = resolveDueDay(referenceLocal.getDate(), target.getFullYear(), target.getMonth());
  return endOfLocalDay(target.getFullYear(), target.getMonth(), day, timezone);
}

/** Vencimento do próximo ciclo, a partir de quando o ciclo atual foi pago. */
export function nextDueDate(params: { paidAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.paidAt, params.timezone);
  return computeDueDate(local, params.cycle, params.timezone);
}

/** Vencimento da primeira cobrança, sem pagamento anterior. */
export function firstDueDate(params: { startedAt: Date; cycle: BillingCycle; timezone: string }): Date {
  const local = new TZDate(params.startedAt, params.timezone);
  return computeDueDate(local, params.cycle, params.timezone);
}

/** Início (inclusive) e fim (exclusivo) do mês, em UTC, no fuso do negócio. */
export function monthBoundsUtc(year: number, month: number, timezone: string): { from: Date; to: Date } {
  const from = new TZDate(year, month, 1, 0, 0, 0, 0, timezone);
  const to = new TZDate(year, month + 1, 1, 0, 0, 0, 0, timezone);
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- dates`
Expected: PASS, all tests green. If a specific ISO string mismatches, print the actual output and adjust the *test's* expected UTC offset — `-03:00` has no DST in Brazil since 2019, so failures point to a real bug in the clamp/timezone logic, not the fixture.

- [ ] **Step 6: Commit**

```bash
git add src/core/dates.ts src/core/dates.test.ts
git commit -m "feat(core): add due-date calculation with month-end clamp and timezone handling"
```

---

### Task 7: `lib/crypto.ts` — AES-256-GCM credential encryption (TDD)

**Files:**
- Create: `src/lib/crypto.ts`, `src/lib/crypto.test.ts`

**Interfaces:**
- Consumes: `process.env.CREDENTIAL_KEY` (base64, 32 bytes) from Task 2's `.env.example`.
- Produces: `encrypt(plain: string, purpose: CryptoPurpose): string`, `decrypt(payload: string, purpose: CryptoPurpose): string`, `type CryptoPurpose = 'subscription.accessPassword' | 'channel.credentials'` — Etapa 1's credential fields depend on this.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';

describe('crypto', () => {
  it('encripta e decripta a mesma string (ida e volta)', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt, decrypt } = await import('./crypto');
    const ciphertext = encrypt('senha-secreta-123', 'subscription.accessPassword');
    expect(ciphertext).not.toBe('senha-secreta-123');
    expect(decrypt(ciphertext, 'subscription.accessPassword')).toBe('senha-secreta-123');
  });

  it('falha explicitamente com finalidade (AAD) errada', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt, decrypt } = await import('./crypto');
    const ciphertext = encrypt('valor', 'subscription.accessPassword');
    expect(() => decrypt(ciphertext, 'channel.credentials')).toThrow();
  });

  it('falha explicitamente com chave errada', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 1).toString('base64');
    const { encrypt } = await import('./crypto');
    const ciphertext = encrypt('valor', 'channel.credentials');

    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(32, 2).toString('base64');
    const { decrypt } = await import('./crypto');
    expect(() => decrypt(ciphertext, 'channel.credentials')).toThrow();
  });

  it('lança erro claro se CREDENTIAL_KEY não tem 32 bytes', async () => {
    vi.resetModules();
    process.env.CREDENTIAL_KEY = Buffer.alloc(16).toString('base64');
    await expect(import('./crypto')).rejects.toThrow('CREDENTIAL_KEY deve ter 32 bytes em base64');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- crypto`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type CryptoPurpose = 'subscription.accessPassword' | 'channel.credentials';

function getKey(): Buffer {
  const raw = process.env.CREDENTIAL_KEY;
  if (!raw) throw new Error('CREDENTIAL_KEY não definido');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('CREDENTIAL_KEY deve ter 32 bytes em base64');
  return key;
}

const KEY = getKey();

/** Formato: v1:<iv>:<ciphertext>:<tag>, tudo em base64. */
export function encrypt(plain: string, purpose: CryptoPurpose): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), ciphertext.toString('base64'), tag.toString('base64')].join(':');
}

export function decrypt(payload: string, purpose: CryptoPurpose): string {
  const [version, ivB64, ciphertextB64, tagB64] = payload.split(':');
  if (version !== 'v1' || !ivB64 || !ciphertextB64 || !tagB64) {
    throw new Error('Payload de criptografia com formato inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
  decipher.setAAD(Buffer.from(purpose));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- crypto`
Expected: PASS, all 4 tests green — including the two explicit-failure cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/crypto.ts src/lib/crypto.test.ts
git commit -m "feat(lib): add AES-256-GCM credential encryption with purpose-bound AAD"
```

---

### Task 8: Prisma schema, first migration, `lib/db.ts`

**Files:**
- Create: `prisma/schema.prisma`, `prisma/migrations/00000000000000_init/migration.sql`, `prisma/README.md`
- Create: `src/lib/db.ts`
- Modify: `.env.example` (already has `DATABASE_URL` from Task 2 — no change needed, just consumed here)

**Interfaces:**
- Produces: `db` (Prisma client singleton) from `src/lib/db.ts`, `User` and `LoginAttempt` Prisma models — Task 10 (auth) depends on both.

- [ ] **Step 1: Install Prisma**

```bash
pnpm add @prisma/client
pnpm add -D prisma
pnpm dlx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id             String   @id @default(uuid(7))
  email          String   @unique
  name           String
  passwordHash   String                       // argon2id
  sessionVersion Int      @default(0)          // bump invalida sessões existentes (troca de senha)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("users")
}

/// Contagem de tentativas de login por IP, pro rate limit — sem Redis.
model LoginAttempt {
  id        String   @id @default(uuid(7))
  ip        String
  createdAt DateTime @default(now())

  @@index([ip, createdAt])
  @@map("login_attempts")
}
```

- [ ] **Step 3: Write the manual migration SQL**

```bash
mkdir -p "prisma/migrations/00000000000000_init"
```

`prisma/migrations/00000000000000_init/migration.sql`:

```sql
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "login_attempts_ip_createdAt_idx" ON "login_attempts"("ip", "createdAt");
```

Note: `uuid(7)` default is applied at the Prisma-client level (`@default(uuid(7))` generates the id in JS before insert), so the SQL column stays a plain `TEXT` primary key — no Postgres-side default needed.

- [ ] **Step 4: `prisma/README.md`**

```markdown
# Prisma

`schema.prisma` não é a fonte única da verdade. Índice parcial, `CHECK` e o singleton de
`settings` (quando existir) entram como SQL manual na migration, porque o Prisma Migrate
não os expressa. Ver `docs/projeto/tecnico/02-modelo-de-dados.md`.

Migration aplicada é imutável — corrigir é migration nova, nunca editar uma existente.
```

- [ ] **Step 5: `src/lib/db.ts` — singleton client**

```ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db = global.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = db;
}
```

- [ ] **Step 6: Apply migration against the docker db and generate client**

```bash
docker compose up -d db
pnpm dlx prisma migrate deploy
pnpm dlx prisma generate
```

Expected: `1 migration found... Applied` and Prisma Client generated without errors.

- [ ] **Step 7: Verify with a smoke query**

```bash
pnpm dlx prisma studio --browser none &
sleep 2 && curl -s http://localhost:5555 -o /dev/null -w "%{http_code}\n"
kill %1
```

Expected: `200`.

- [ ] **Step 8: Commit**

```bash
git add prisma src/lib/db.ts
git commit -m "feat(db): add Prisma schema with User/LoginAttempt and initial migration"
```

---

### Task 9: `lib/env.ts` and `lib/logger.ts`

**Files:**
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/logger.ts`, `src/lib/logger.test.ts`

**Interfaces:**
- Produces: `requireEnv(name: string): string`, `logger.info(fields: Record<string, unknown>): void` / `logger.error(...)` / `logger.warn(...)` — Task 7's `crypto.ts` conceptually uses the same pattern as `requireEnv`; Task 10 (auth) and Task 12 (cron route) use `logger`.

- [ ] **Step 1: Write failing tests**

`src/lib/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { requireEnv } from './env';

describe('requireEnv', () => {
  it('devolve o valor quando a env existe', () => {
    process.env.TEST_VAR = 'valor';
    expect(requireEnv('TEST_VAR')).toBe('valor');
  });

  it('lança erro explícito quando a env não existe', () => {
    delete process.env.TEST_VAR_MISSING;
    expect(() => requireEnv('TEST_VAR_MISSING')).toThrow('TEST_VAR_MISSING não definido');
  });
});
```

`src/lib/logger.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  it('escreve JSON estruturado em stdout com level e timestamp', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info({ route: '/api/health', durationMs: 12 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = JSON.parse(spy.mock.calls[0][0] as string);
    expect(line.level).toBe('info');
    expect(line.route).toBe('/api/health');
    expect(typeof line.timestamp).toBe('string');
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `pnpm test -- env logger`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/lib/env.ts`**

```ts
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definido`);
  return value;
}
```

- [ ] **Step 4: Implement `src/lib/logger.ts`**

```ts
type LogFields = Record<string, unknown>;

function write(level: 'info' | 'warn' | 'error', fields: LogFields): void {
  console.log(JSON.stringify({ level, timestamp: new Date().toISOString(), ...fields }));
}

export const logger = {
  info: (fields: LogFields) => write('info', fields),
  warn: (fields: LogFields) => write('warn', fields),
  error: (fields: LogFields) => write('error', fields),
};
```

- [ ] **Step 5: Run to verify both pass**

Run: `pnpm test -- env logger`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts src/lib/logger.ts src/lib/logger.test.ts
git commit -m "feat(lib): add requireEnv and structured JSON logger"
```

---

### Task 10: Auth — session, middleware, login, change password

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/lib/errors.ts`
- Create: `src/features/auth/schema.ts`, `src/features/auth/service.ts`, `src/features/auth/actions.ts`
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/login/login-form.tsx`
- Create: `src/middleware.ts`
- Modify: `src/app/page.tsx` (redirect `/` → `/login` or `/conta` depending on session — replaced fully by Task 19's `(app)` layout, kept minimal here)
- Test: `src/lib/auth.test.ts`, `src/features/auth/service.integration.test.ts`

**Interfaces:**
- Consumes: `db` (Task 8), `logger` (Task 9), `requireEnv` (Task 9).
- Produces: `signSession(payload: { userId: string; sessionVersion: number }): Promise<string>`, `verifySession(token: string): Promise<{ userId: string; sessionVersion: number } | null>` from `lib/auth.ts`; `DomainError`, `InvalidCredentialsError` from `lib/errors.ts`; `loginAction(input: unknown)`, `changePasswordAction(input: unknown)`, `requireSession()` from `features/auth/*` — every future Server Action calls `requireSession()`.

- [ ] **Step 1: Install auth deps**

```bash
pnpm add jose @node-rs/argon2 zod
```

- [ ] **Step 2: `src/lib/errors.ts` — DomainError base**

```ts
export class DomainError extends Error {
  constructor(message: string, readonly code: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor(cause?: unknown) {
    super('E-mail ou senha não conferem.', 'INVALID_CREDENTIALS', { cause });
  }
}

export class TooManyLoginAttemptsError extends DomainError {
  constructor(cause?: unknown) {
    super('Muitas tentativas. Aguarde alguns minutos e tente de novo.', 'TOO_MANY_ATTEMPTS', { cause });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(cause?: unknown) {
    super('Sessão expirada. Entre novamente.', 'UNAUTHORIZED', { cause });
  }
}
```

- [ ] **Step 3: Write failing unit test for `lib/auth.ts`**

`src/lib/auth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('session JWT', () => {
  it('assina e verifica ida e volta', async () => {
    process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long-ok';
    const { signSession, verifySession } = await import('./auth');
    const token = await signSession({ userId: 'user-1', sessionVersion: 0 });
    const payload = await verifySession(token);
    expect(payload).toEqual({ userId: 'user-1', sessionVersion: 0 });
  });

  it('devolve null para token inválido', async () => {
    process.env.SESSION_SECRET = 'test-secret-at-least-32-bytes-long-ok';
    const { verifySession } = await import('./auth');
    expect(await verifySession('token-invalido')).toBeNull();
  });
});
```

Run: `pnpm test -- auth`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/auth.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { requireEnv } from './env';

const COOKIE_NAME = 'mtconexoes_session';
const SESSION_DAYS = 30;

interface SessionPayload {
  userId: string;
  sessionVersion: number;
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv('SESSION_SECRET'));
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string' || typeof payload.sessionVersion !== 'number') return null;
    return { userId: payload.userId, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function readSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value;
}

export { COOKIE_NAME };
```

- [ ] **Step 5: Run to verify unit tests pass**

Run: `pnpm test -- auth`
Expected: PASS (the two JWT tests — `cookies()` isn't exercised by these, it's exercised end-to-end in Step 11).

- [ ] **Step 6: `src/features/auth/schema.ts`**

```ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido.'),
  password: z.string().min(1, 'Informe a senha.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres.'),
});
```

- [ ] **Step 7: `src/features/auth/service.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { InvalidCredentialsError, TooManyLoginAttemptsError, UnauthorizedError } from '@/lib/errors';
import { readSessionCookie, signSession, verifySession } from '@/lib/auth';

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function login(input: { email: string; password: string; ip: string }) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const attempts = await db.loginAttempt.count({ where: { ip: input.ip, createdAt: { gte: since } } });
  if (attempts >= MAX_ATTEMPTS) throw new TooManyLoginAttemptsError();

  const user = await db.user.findUnique({ where: { email: input.email } });
  const validPassword = user ? await verify(user.passwordHash, input.password) : false;

  if (!user || !validPassword) {
    await db.loginAttempt.create({ data: { ip: input.ip } });
    throw new InvalidCredentialsError();
  }

  return signSession({ userId: user.id, sessionVersion: user.sessionVersion });
}

export async function getCurrentUser() {
  const token = await readSessionCookie();
  if (!token) return null;

  const payload = await verifySession(token);
  if (!payload) return null;

  const user = await db.user.findUnique({ where: { id: payload.userId } });
  if (!user || user.sessionVersion !== payload.sessionVersion) return null;

  return user;
}

export async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function changePassword(input: { currentPassword: string; newPassword: string }) {
  const user = await requireSession();
  const validPassword = await verify(user.passwordHash, input.currentPassword);
  if (!validPassword) throw new InvalidCredentialsError();

  const passwordHash = await hash(input.newPassword);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  return signSession({ userId: updated.id, sessionVersion: updated.sessionVersion });
}
```

- [ ] **Step 8: `src/features/auth/actions.ts`**

```ts
'use server';

import { headers } from 'next/headers';
import { changePasswordSchema, loginSchema } from './schema';
import { changePassword, login } from './service';
import { setSessionCookie } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export async function loginAction(input: unknown) {
  const data = loginSchema.parse(input);
  const ip = (await headers()).get('x-forwarded-for') ?? 'unknown';

  try {
    const token = await login({ ...data, ip });
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'auth.login', error: String(err) });
    return { error: { code: 'UNEXPECTED', message: 'Não foi possível entrar. Tente de novo.' } };
  }
}

export async function changePasswordAction(input: unknown) {
  const data = changePasswordSchema.parse(input);

  try {
    const token = await changePassword(data);
    await setSessionCookie(token);
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'auth.changePassword', error: String(err) });
    return { error: { code: 'UNEXPECTED', message: 'Não foi possível trocar a senha. Tente de novo.' } };
  }
}
```

(29 and 24 lines respectively, both within the 30-line Server Action budget.)

- [ ] **Step 9: `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth';

const PUBLIC_PATHS = ['/login'];

export async function middleware(req: NextRequest) {
  if (PUBLIC_PATHS.some((p) => req.nextUrl.pathname.startsWith(p))) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/cron')) return NextResponse.next();

  const token = req.cookies.get('mtconexoes_session')?.value;
  const payload = token ? await verifySession(token) : null;

  if (!payload) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 10: Login page + form**

`src/app/(auth)/login/page.tsx`:

```tsx
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-[380px] rounded-[10px] border border-border bg-surface p-6">
        <h1 className="mb-6 text-xl font-extrabold text-foreground">Entrar no painel</h1>
        <LoginForm />
      </div>
    </div>
  );
}
```

`src/app/(auth)/login/login-form.tsx`:

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { loginSchema } from '@/features/auth/schema';
import { loginAction } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type FormValues = { email: string; password: string };

export function LoginForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const result = await loginAction(values);
    if ('error' in result) {
      setServerError(result.error.message);
      return;
    }
    window.location.href = '/';
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" {...register('email')} className="h-11" />
        {errors.email && <p className="mt-1 text-sm text-danger">{errors.email.message}</p>}
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" {...register('password')} className="h-11" />
        {errors.password && <p className="mt-1 text-sm text-danger">{errors.password.message}</p>}
      </div>
      {serverError && <p className="text-sm text-danger">{serverError}</p>}
      <Button type="submit" disabled={isSubmitting} className="h-11 bg-brand text-background">
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </Button>
    </form>
  );
}
```

Install the resolver: `pnpm add @hookform/resolvers react-hook-form`.

- [ ] **Step 11: Integration test for the auth service against real Postgres**

`src/features/auth/service.integration.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hash } from '@node-rs/argon2';
import { db } from '@/lib/db';
import { login } from './service';
import { InvalidCredentialsError, TooManyLoginAttemptsError } from '@/lib/errors';

const TEST_EMAIL = 'teste@mtconexoes.com.br';

beforeEach(async () => {
  await db.user.create({
    data: { email: TEST_EMAIL, name: 'Teste', passwordHash: await hash('senha-correta') },
  });
});

afterEach(async () => {
  await db.loginAttempt.deleteMany();
  await db.user.deleteMany({ where: { email: TEST_EMAIL } });
});

describe('login', () => {
  it('devolve token com senha correta', async () => {
    const token = await login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.1' });
    expect(typeof token).toBe('string');
  });

  it('rejeita senha errada', async () => {
    await expect(login({ email: TEST_EMAIL, password: 'errada', ip: '127.0.0.2' }))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('bloqueia após 5 tentativas erradas na janela de 15 minutos', async () => {
    for (let i = 0; i < 5; i++) {
      await login({ email: TEST_EMAIL, password: 'errada', ip: '127.0.0.3' }).catch(() => {});
    }
    await expect(login({ email: TEST_EMAIL, password: 'senha-correta', ip: '127.0.0.3' }))
      .rejects.toBeInstanceOf(TooManyLoginAttemptsError);
  });
});
```

- [ ] **Step 12: Run everything**

```bash
docker compose up -d db
pnpm dlx prisma migrate deploy
process_env=$(cat .env.local) pnpm test -- auth
pnpm test:integration -- service.integration
```

Expected: unit tests PASS; integration tests PASS against the docker Postgres.

- [ ] **Step 13: Commit**

```bash
git add src/lib/auth.ts src/lib/errors.ts src/features/auth src/app/\(auth\) src/middleware.ts
git commit -m "feat(auth): add session JWT, login rate limit, change password, middleware guard"
```

---

### Task 11: `/api/health` and `/api/cron/ping`

**Files:**
- Create: `src/app/api/health/route.ts`
- Create: `src/app/api/cron/ping/route.ts`
- Create: `src/lib/cron-auth.ts`

**Interfaces:**
- Consumes: `logger` (Task 9), `requireEnv` (Task 9), `CRON_SECRET` env (Task 2) for dev; real OIDC verification is a documented TODO with an explicit owner comment for Etapa 2's real cron jobs — this task only proves the auth-gate shape end-to-end with the dev secret.
- Produces: `assertCronRequest(req: Request): void` (throws on missing/invalid auth) — Etapa 2+ cron routes (`dunning-evaluate`, `charges-mark-overdue`) reuse this.

- [ ] **Step 1: `src/app/api/health/route.ts`**

```ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
```

- [ ] **Step 2: `src/lib/cron-auth.ts`**

```ts
import { requireEnv } from './env';

/**
 * Dev: bearer token fixo (CRON_SECRET), batido pelo container cron-sim do docker-compose.
 * Produção: Cloud Scheduler chama com OIDC — trocar por verificação real (google-auth-library)
 * antes da Etapa 2, quando os jobs de negócio existirem. Ver docs/projeto/tecnico/05-credenciais-e-seguranca.md.
 */
export function assertCronRequest(req: Request): void {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${requireEnv('CRON_SECRET')}`;
  if (auth !== expected) throw new Error('unauthorized');
}
```

- [ ] **Step 3: `src/app/api/cron/ping/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { assertCronRequest } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    assertCronRequest(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  logger.info({ job: 'cron-ping', status: 'ok' });
  return NextResponse.json({ pong: true });
}
```

- [ ] **Step 4: Verify manually**

```bash
pnpm dev &
sleep 3
curl -s http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/cron/ping
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Bearer dev-cron-secret" http://localhost:3000/api/cron/ping
kill %1
```

Expected: `{"status":"ok"}`, then `401`, then `200`.

- [ ] **Step 5: Verify cron-sim container hits it successfully**

```bash
docker compose up -d
sleep 65
docker compose logs cron-sim | tail -5
```

Expected: log line showing `-> 200`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/health src/app/api/cron src/lib/cron-auth.ts
git commit -m "feat: add /api/health and CRON_SECRET-gated /api/cron/ping"
```

---

### Task 12: Design tokens — Tailwind theme, fonts

**Files:**
- Modify: `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**
- Produces: Tailwind theme tokens (`bg-background`, `bg-surface`, `bg-surface-elevated`, `border-border`, `border-border-strong`, `text-foreground`, `text-foreground-muted`, `text-foreground-disabled`, `bg-brand`/`text-brand`, `bg-brand-light`, `text-success`, `text-warning`, `text-danger`, font families `font-sans` (Nunito) and `font-mono` (IBM Plex Mono)) — every component from Task 13 onward uses these instead of hardcoded hex.

- [ ] **Step 1: Extend `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0C',
        surface: '#141417',
        'surface-elevated': '#1D1D21',
        border: {
          DEFAULT: '#2B2B31',
          strong: '#3A3A42',
        },
        foreground: {
          DEFAULT: '#F7F5F3',
          muted: '#A3A3AB',
          disabled: '#4B4B54',
        },
        brand: {
          DEFAULT: '#EA580C',
          light: '#F97316',
        },
        success: '#4ADE80',
        warning: '#FBBF24',
        danger: '#F87171',
      },
      borderRadius: {
        DEFAULT: '10px',
        sm: '4px',
        full: '50%',
      },
      spacing: {
        18: '4.5rem', // 72px, only if needed by a component — otherwise rely on default scale (4/8/12/16px already match the 4-28 scale)
      },
      fontFamily: {
        sans: ['var(--font-nunito)', 'sans-serif'],
        mono: ['var(--font-ibm-plex-mono)', 'monospace'],
      },
      screens: {
        md: '900px', // único breakpoint do handoff
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 2: Wire fonts via `next/font` in `src/app/layout.tsx`**

```tsx
import { Nunito, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${nunito.variable} ${ibmPlexMono.variable}`}>
      <body className="bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: `globals.css` — reduced motion + tabular nums utility**

Append to `src/app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.tabular-mono {
  font-variant-numeric: tabular-nums;
}

*:focus-visible {
  outline: 2px solid #F97316;
  outline-offset: 2px;
}
```

- [ ] **Step 4: Verify visually**

```bash
pnpm dev &
sleep 3
curl -s http://localhost:3000/login -o /tmp/login.html
grep -o 'bg-background\|font-sans' /tmp/login.html | sort -u
kill %1
```

Expected: both classes present in the rendered HTML.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): add design tokens and Nunito/IBM Plex Mono fonts"
```

---

### Task 13: `components/ui/` base — StatusBadge, EmptyState, Skeleton, ConfirmDialog

**Files:**
- Create: `src/components/ui/status-badge.tsx`, `src/components/ui/status-badge.test.tsx`
- Create: `src/components/ui/empty-state.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/confirm-dialog.tsx`

**Interfaces:**
- Consumes: shadcn `Button`, `Dialog` (install in Step 1).
- Produces: `<StatusBadge tone="success" | "warning" | "danger" | "neutral">{label}</StatusBadge>`, `<EmptyState icon title description action? />`, `<Skeleton className? />`, `<ConfirmDialog open onOpenChange title description confirmLabel onConfirm />` — every future list/table screen (Etapa 1+) uses these instead of ad-hoc markup.

- [ ] **Step 1: Install shadcn Dialog primitive**

```bash
pnpm dlx shadcn@latest add dialog
```

- [ ] **Step 2: Write the failing test for StatusBadge**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renderiza o texto e aplica a cor da faixa', () => {
    render(<StatusBadge tone="success">Pago</StatusBadge>);
    const badge = screen.getByText('Pago');
    expect(badge).toHaveClass('text-success');
  });

  it('nunca depende só de cor — sempre tem texto', () => {
    render(<StatusBadge tone="danger">Falha</StatusBadge>);
    expect(screen.getByText('Falha')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- status-badge`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `StatusBadge`**

```tsx
import type { ReactNode } from 'react';

const TONE_CLASSES = {
  success: 'bg-success/[.12] text-success',
  warning: 'bg-warning/[.14] text-warning',
  danger: 'bg-danger/[.12] text-danger',
  neutral: 'bg-surface-elevated text-foreground-muted',
} as const;

export function StatusBadge({ tone, children }: { tone: keyof typeof TONE_CLASSES; children: ReactNode }) {
  return (
    <span className={`inline-flex h-6 items-center rounded-sm px-2 text-xs font-bold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- status-badge`
Expected: PASS.

- [ ] **Step 6: Implement `EmptyState` (no test — static markup)**

```tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded border border-border bg-surface p-10 text-center">
      <Icon size={22} className="text-foreground-muted" />
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-sm text-foreground-muted">{description}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 7: Implement `Skeleton`**

```tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-elevated ${className}`} />;
}
```

- [ ] **Step 8: Implement `ConfirmDialog`**

```tsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] bg-surface">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="bg-brand text-background" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 9: Install lucide-react**

```bash
pnpm add lucide-react
```

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/status-badge.tsx src/components/ui/status-badge.test.tsx src/components/ui/empty-state.tsx src/components/ui/skeleton.tsx src/components/ui/confirm-dialog.tsx
git commit -m "feat(ui): add StatusBadge, EmptyState, Skeleton, ConfirmDialog base components"
```

---

### Task 14: Masked form inputs — CurrencyInput, PhoneInput, DateInput

**Files:**
- Create: `src/components/ui/currency-input.tsx`, `src/components/ui/currency-input.test.tsx`
- Create: `src/components/ui/phone-input.tsx`, `src/components/ui/phone-input.test.tsx`
- Create: `src/components/ui/date-input.tsx`

**Interfaces:**
- Consumes: `Input` (shadcn, Task 1), `react-imask`.
- Produces: `<CurrencyInput value={string} onValueChange={(cents: string) => void} />` (works in cents, never `number`), `<PhoneInput value={string} onValueChange={(e164: string) => void} />` (displays masked, stores E.164), `<DateInput value={string} onValueChange={(isoDate: string) => void} />` — Etapa 1's `Subscription`/`Customer` forms use these via RHF `Controller`.

- [ ] **Step 1: Install `react-imask`**

```bash
pnpm add react-imask
```

- [ ] **Step 2: Write the failing test for `CurrencyInput`**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyInput } from './currency-input';

describe('CurrencyInput', () => {
  it('exibe o valor formatado em reais a partir de centavos', () => {
    render(<CurrencyInput value="12345" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('R$ 123,45');
  });

  it('digitar dispara onValueChange em centavos, nunca number', async () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value="0" onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox');
    await userEvent.type(input, '500');
    expect(onValueChange).toHaveBeenLastCalledWith('500');
  });
});
```

Install `@testing-library/user-event`: `pnpm add -D @testing-library/user-event`.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm test -- currency-input`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `CurrencyInput`**

```tsx
'use client';

import { IMaskInput } from 'react-imask';

export function CurrencyInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // centavos, como string
  onValueChange: (cents: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="R$ num"
      blocks={{
        num: {
          mask: Number,
          scale: 2,
          thousandsSeparator: '.',
          radix: ',',
          padFractionalZeros: true,
          normalizeZeros: true,
        },
      }}
      unmask={false}
      value={(Number(value) / 100).toFixed(2).replace('.', ',')}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        const cents = Math.round(parseFloat(instance.unmaskedValue.replace(',', '.') || '0') * 100);
        onValueChange(String(cents));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm test -- currency-input`
Expected: PASS. If the mask library's `onAccept` fires with slightly different rounding on the typed case, adjust the test's typed sequence (not the component's cents math) until it reflects real user typing behavior.

- [ ] **Step 6: Write the failing test for `PhoneInput`**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput } from './phone-input';

describe('PhoneInput', () => {
  it('exibe o telefone formatado a partir de E.164', () => {
    render(<PhoneInput value="+5511999998888" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('(11) 99999-8888');
  });

  it('digitar dispara onValueChange em E.164', async () => {
    const onValueChange = vi.fn();
    render(<PhoneInput value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole('textbox'), '11999998888');
    expect(onValueChange).toHaveBeenLastCalledWith('+5511999998888');
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm test -- phone-input`
Expected: FAIL.

- [ ] **Step 8: Implement `PhoneInput`**

```tsx
'use client';

import { IMaskInput } from 'react-imask';

function toE164(digits: string): string {
  return digits ? `+55${digits}` : '';
}

function fromE164(e164: string): string {
  return e164.replace(/^\+55/, '');
}

export function PhoneInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // E.164, ex.: +5511999998888
  onValueChange: (e164: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="(00) 00000-0000"
      value={fromE164(value)}
      unmask={true}
      onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
        onValueChange(toE164(instance.unmaskedValue));
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm test -- phone-input`
Expected: PASS.

- [ ] **Step 10: Implement `DateInput` (no dedicated test — thin wrapper, covered by future form integration tests)**

```tsx
'use client';

import { IMaskInput } from 'react-imask';

export function DateInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // ISO yyyy-MM-dd
  onValueChange: (isoDate: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="00/00/0000"
      value={value ? value.split('-').reverse().join('/') : ''}
      unmask={false}
      onAccept={(masked: string) => {
        const [day, month, year] = masked.split('/');
        if (day && month && year?.length === 4) {
          onValueChange(`${year}-${month}-${day}`);
        }
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add src/components/ui/currency-input.tsx src/components/ui/currency-input.test.tsx src/components/ui/phone-input.tsx src/components/ui/phone-input.test.tsx src/components/ui/date-input.tsx
git commit -m "feat(ui): add masked CurrencyInput, PhoneInput, DateInput"
```

---

### Task 15: `DataTable` generic component

**Files:**
- Create: `src/components/ui/data-table.tsx`, `src/components/ui/data-table.test.tsx`

**Interfaces:**
- Consumes: `Skeleton`, `EmptyState` (Task 13).
- Produces: `<DataTable columns={Column<T>[]} rows={T[]} rowKey={(row: T) => string} page={number} perPage={8|12|20} total={number} onPageChange={(page: number) => void} onPerPageChange={(perPage: number) => void} emptyState={ReactNode} loading?={boolean} />` where `Column<T> = { header: string; align?: 'left'|'right'; cell: (row: T) => ReactNode }` — every future list screen (Clientes, Cobranças, Mensagens, Leads, Fornecedores, Planos) uses this.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from './data-table';

type Row = { id: string; name: string };

const columns = [
  { header: 'Nome', cell: (row: Row) => row.name },
];

describe('DataTable', () => {
  it('renderiza cabeçalho e linhas', () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'João' }]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={1}
        onPageChange={() => {}}
        onPerPageChange={() => {}}
        emptyState={<p>vazio</p>}
      />,
    );
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('João')).toBeInTheDocument();
  });

  it('mostra emptyState quando não há linhas', () => {
    render(
      <DataTable
        columns={columns}
        rows={[]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={0}
        onPageChange={() => {}}
        onPerPageChange={() => {}}
        emptyState={<p>Nenhum registro</p>}
      />,
    );
    expect(screen.getByText('Nenhum registro')).toBeInTheDocument();
  });

  it('botão de próxima página dispara onPageChange', async () => {
    const onPageChange = vi.fn();
    const { default: userEvent } = await import('@testing-library/user-event');
    render(
      <DataTable
        columns={columns}
        rows={[{ id: '1', name: 'João' }]}
        rowKey={(row: Row) => row.id}
        page={1}
        perPage={8}
        total={20}
        onPageChange={onPageChange}
        onPerPageChange={() => {}}
        emptyState={<p>vazio</p>}
      />,
    );
    await userEvent.click(screen.getByLabelText('Próxima página'));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test -- data-table`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DataTable`**

```tsx
'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';
import { Inbox } from 'lucide-react';

export interface Column<T> {
  header: string;
  align?: 'left' | 'right';
  cell: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  emptyState,
  loading = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page: number;
  perPage: 8 | 12 | 20;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: 8 | 12 | 20) => void;
  emptyState: ReactNode;
  loading?: boolean;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const canPrev = page > 1;
  const canNext = to < total;

  if (loading) {
    return (
      <div className="overflow-hidden rounded border border-border bg-surface">
        {Array.from({ length: perPage }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-8" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState icon={Inbox} title="Nada por aqui" description="" action={emptyState} />;
  }

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="h-11 border-b border-border last:border-0">
                {columns.map((col) => (
                  <td
                    key={col.header}
                    className={`px-4 text-sm ${col.align === 'right' ? 'text-right font-mono tabular-mono' : 'text-left'}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="font-mono text-xs tabular-mono text-foreground-muted">
          {from}–{to} de {total}
        </span>
        <div className="flex items-center gap-3">
          <select
            aria-label="Por página"
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value) as 8 | 12 | 20)}
            className="h-8 rounded-sm border border-border bg-surface-elevated px-2 text-xs"
          >
            {[8, 12, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Página anterior"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-border disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-border disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test -- data-table`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/data-table.tsx src/components/ui/data-table.test.tsx
git commit -m "feat(ui): add generic DataTable with pagination"
```

---

### Task 16: App shell — Sidebar, Header, PauseBanner

**Files:**
- Create: `src/components/layout/sidebar.tsx`, `src/components/layout/header.tsx`, `src/components/layout/pause-banner.tsx`, `src/components/layout/app-shell.tsx`
- Create: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: `getCurrentUser` (Task 10, for the header/sidebar to know who's logged in — not required to render, just available).
- Produces: `<AppShell title="..." primaryAction={ReactNode}>{children}</AppShell>` — every future `(app)` route (Task 19's `/conta` and all Etapa 1+ screens) wraps its `page.tsx` content in this.

- [ ] **Step 1: `src/components/layout/sidebar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Receipt, MessageSquare, GitCommitHorizontal,
  Inbox, ChartNoAxesColumn, Truck, Layers, Settings, Pause, Play,
} from 'lucide-react';
import { useState } from 'react';

const MENU_ITEMS = [
  { href: '/', label: 'Início', icon: LayoutDashboard },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/cobrancas', label: 'Cobranças', icon: Receipt },
  { href: '/mensagens', label: 'Mensagens', icon: MessageSquare },
  { href: '/regua', label: 'Réguas', icon: GitCommitHorizontal },
  { href: '/leads', label: 'Leads', icon: Inbox },
  { href: '/relatorios', label: 'Relatórios', icon: ChartNoAxesColumn },
  { href: '/fornecedores', label: 'Fornecedores', icon: Truck },
  { href: '/planos', label: 'Planos', icon: Layers },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [paused, setPaused] = useState(false);

  return (
    <aside className="sticky top-0 flex h-screen w-60 flex-col border-r border-border">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-brand text-sm font-black text-background">
          MT
        </span>
        <span className="text-base font-extrabold text-foreground">
          MT <span className="font-normal">Conexões</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {MENU_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex h-10 items-center gap-2.5 border-l-2 px-4 text-sm font-semibold ${
                active
                  ? 'border-brand bg-surface text-foreground'
                  : 'border-transparent text-foreground-muted'
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>
      <button
        type="button"
        aria-label={paused ? 'Envios pausados, retomar' : 'Pausar envios'}
        title={paused ? 'Envios pausados, retomar' : 'Pausar envios'}
        onClick={() => setPaused((p) => !p)}
        className={`m-3 flex h-11 items-center justify-center gap-2 rounded border text-sm font-semibold ${
          paused ? 'border-brand bg-brand text-background' : 'border-border text-foreground-muted'
        }`}
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
        {paused ? 'Envios pausados, retomar' : 'Pausar envios'}
      </button>
    </aside>
  );
}
```

Note: kill-switch state here is local UI-only in Etapa 0 (no `Settings.sendingPaused` yet — that's Etapa 1's `Settings` CRUD). Wiring to real persisted state is a follow-up task once `Settings` exists.

- [ ] **Step 2: `src/components/layout/pause-banner.tsx`**

```tsx
export function PauseBanner({ paused }: { paused: boolean }) {
  if (!paused) return null;
  return (
    <div className="bg-brand px-4 py-2 text-center text-sm font-bold text-background">
      Envios pausados. Nenhuma mensagem automática sai enquanto isso.
    </div>
  );
}
```

- [ ] **Step 3: `src/components/layout/header.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Header({ title, primaryAction }: { title: string; primaryAction?: ReactNode }) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      {primaryAction}
    </header>
  );
}
```

- [ ] **Step 4: `src/components/layout/app-shell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Sidebar } from './sidebar';
import { Header } from './header';

export function AppShell({
  title,
  primaryAction,
  children,
}: {
  title: string;
  primaryAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Header title={title} primaryAction={primaryAction} />
        <main className="flex-1 p-4 md:p-7" style={{ padding: 'clamp(16px, 3vw, 28px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `src/app/(app)/layout.tsx`**

```tsx
import type { ReactNode } from 'react';

export default function AppGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

(Kept as a pass-through — each page composes its own `<AppShell title="...">`, per `.claude/rules/04-frontend.md`'s "page.tsx é composição".)

- [ ] **Step 6: Verify it renders**

Run: `pnpm typecheck && pnpm build`
Expected: succeeds with no type errors from the new components.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout src/app/\(app\)/layout.tsx
git commit -m "feat(layout): add Sidebar, Header, PauseBanner, AppShell"
```

---

### Task 17: `lib/messages.ts` and toast wiring (sonner)

**Files:**
- Create: `src/lib/messages.ts`
- Modify: `src/app/layout.tsx` (add `<Toaster />`)
- Create: `src/lib/toast.ts`

**Interfaces:**
- Produces: `messages` dictionary object, `toastSuccess(message: string): void`, `toastError(error: { code: string; message: string } | undefined): void` — Task 19's change-password form is the first consumer; every future feature form follows the same pattern.

- [ ] **Step 1: Install `sonner`**

```bash
pnpm add sonner
```

- [ ] **Step 2: `src/lib/messages.ts`**

```ts
export const messages = {
  common: {
    unexpectedError: 'Algo deu errado. Tente de novo em instantes.',
  },
  auth: {
    passwordChanged: 'Senha alterada com sucesso.',
  },
} as const;
```

(Grows per domain as features land — Etapa 1 adds `messages.customers.*`, `messages.charges.*`, etc.)

- [ ] **Step 3: `src/lib/toast.ts`**

```ts
import { toast } from 'sonner';
import { messages } from './messages';

export function toastSuccess(message: string): void {
  toast.success(message);
}

export function toastError(error?: { code: string; message: string }): void {
  toast.error(error?.message ?? messages.common.unexpectedError);
}
```

- [ ] **Step 4: Add `<Toaster />` to root layout**

Modify `src/app/layout.tsx` body:

```tsx
import { Toaster } from 'sonner';
// ...
<body className="bg-background font-sans text-foreground antialiased">
  {children}
  <Toaster
    theme="dark"
    toastOptions={{
      style: {
        background: '#141417',
        border: '1px solid #2B2B31',
        color: '#F7F5F3',
      },
    }}
  />
</body>
```

- [ ] **Step 5: Verify build**

Run: `pnpm typecheck && pnpm build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/messages.ts src/lib/toast.ts src/app/layout.tsx
git commit -m "feat: add pt-BR message dictionary and sonner toast wiring"
```

---

### Task 18: `/conta` — change-password screen (integration proof)

**Files:**
- Create: `src/app/(app)/conta/page.tsx`, `src/app/(app)/conta/change-password-form.tsx`
- Modify: `src/app/page.tsx` (redirect `/` to `/conta` — placeholder until Etapa 1's dashboard exists)

**Interfaces:**
- Consumes: `AppShell` (Task 16), `changePasswordAction`/`changePasswordSchema` (Task 10), `toastSuccess`/`toastError` (Task 17), `messages` (Task 17).
- Produces: the reference pattern every future form in the codebase copies: RHF + Zod (same schema as the action) + disabled-during-submit + `DomainError` → toast.

- [ ] **Step 1: `src/app/(app)/conta/change-password-form.tsx`**

```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@/features/auth/schema';
import { changePasswordAction } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';

type FormValues = { currentPassword: string; newPassword: string };

export function ChangePasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(changePasswordSchema) });

  async function onSubmit(values: FormValues) {
    const result = await changePasswordAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.auth.passwordChanged);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4 rounded border border-border bg-surface p-5">
      <div>
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input id="currentPassword" type="password" {...register('currentPassword')} className="h-11" />
        {errors.currentPassword && <p className="mt-1 text-sm text-danger">{errors.currentPassword.message}</p>}
      </div>
      <div>
        <Label htmlFor="newPassword">Nova senha</Label>
        <Input id="newPassword" type="password" {...register('newPassword')} className="h-11" />
        {errors.newPassword && <p className="mt-1 text-sm text-danger">{errors.newPassword.message}</p>}
      </div>
      <Button type="submit" disabled={isSubmitting} className="h-11 bg-brand text-background">
        {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: `src/app/(app)/conta/page.tsx`**

```tsx
import { AppShell } from '@/components/layout/app-shell';
import { ChangePasswordForm } from './change-password-form';

export default function ContaPage() {
  return (
    <AppShell title="Conta">
      <ChangePasswordForm />
    </AppShell>
  );
}
```

- [ ] **Step 3: `src/app/page.tsx` — redirect to `/conta`**

```tsx
import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/conta');
}
```

- [ ] **Step 4: Manual end-to-end verification**

```bash
docker compose up -d db
pnpm dlx prisma migrate deploy
pnpm dev &
sleep 3
curl -sL http://localhost:3000/ -o /tmp/root.html   # redirects to /login without a session
grep -o 'Entrar no painel' /tmp/root.html
kill %1
```

Expected: match found — confirms middleware redirect + login page render end-to-end.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/conta src/app/page.tsx
git commit -m "feat: add /conta change-password screen as the reference form pattern"
```

---

### Task 19: Final verification pass

**Files:** none created — this task only runs checks.

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: every test from Tasks 4–17 PASS.

- [ ] **Step 2: Full integration suite (docker db up)**

Run: `docker compose up -d db && pnpm dlx prisma migrate deploy && pnpm test:integration`
Expected: PASS.

- [ ] **Step 3: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all succeed, no errors.

- [ ] **Step 4: Docker compose full stack**

Run: `docker compose up -d && docker compose ps`
Expected: `db` healthy, `cron-sim` running.

- [ ] **Step 5: Confirm README note on how to run locally**

Add a "Rodando localmente" section to `README.md` (append, don't rewrite existing content) with: `cp .env.example .env.local`, `docker compose up -d db`, `pnpm install`, `pnpm dlx prisma migrate deploy`, `pnpm dev`, `pnpm test`, `pnpm test:integration`.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: add local setup instructions to README"
```

- [ ] **Step 7: Update plano de entrega checkboxes**

Edit `docs/projeto/tecnico/07-plano-de-entrega.md`, check off the Etapa 0 items that are now done (Next.js/Prisma/core/auth/crypto/Vitest/logs/health — leave "Deploy no Cloud Run funcionando ponta a ponta" unchecked, since Task 2 only prepared the Dockerfile without deploying).

```bash
git add docs/projeto/tecnico/07-plano-de-entrega.md
git commit -m "docs: check off completed Etapa 0 items in delivery plan"
```

---

## Self-review notes

- **Spec coverage:** docker (Task 2), bootstrap incl. core/money/dates/auth/crypto/vitest/health (Tasks 1,3,4,6,7,8,9,10,11), design tokens + components (Tasks 12–16), forms/masks (Task 14, demonstrated in Task 18), API/toast/i18n convention (Task 17), naming `mt-conexoes` (Tasks 1,2). All spec sections have a task.
- **Deferred, explicitly flagged, not silently dropped:** real Cloud Run deploy (Task 2 prepares Dockerfile only, Task 19 leaves the checkbox unchecked), real OIDC cron verification (Task 11's `cron-auth.ts` has an inline comment pointing to the Etapa 2 replacement), kill switch persistence (Task 16's `Sidebar` note — needs `Settings` model from Etapa 1).
- **Type consistency checked:** `CurrencyInput`/`PhoneInput`/`DateInput` signatures (Task 14) match how Task 18's forms would use them conceptually (Task 18 itself doesn't need a masked field — change password is plain text — so masks are proven via their own component tests, consistent with the spec's "conforme aplicável"). `DataTable`'s `Column<T>` shape is self-contained and has no other consumer yet (first real consumer is Etapa 1's Clientes list).
