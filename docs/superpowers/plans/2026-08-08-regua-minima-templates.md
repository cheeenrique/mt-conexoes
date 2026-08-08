# Régua mínima — modelo, editor de passos e templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer `DunningRule`/`DunningStep` pra frente da Etapa 4, só o suficiente pra existir onde editar template (Etapa 3), com validação de variável e prévia usando cobrança real — sem motor de avaliação/despacho.

**Architecture:** `core/dunning-template.ts` puro faz parse/validação/render de `{{variável}}`. `features/dunning/service.ts` chama o `core` antes de persistir. UI: página `/regua` lista os 6 passos seedados, drawer edita cada um com prévia client-side (dado já veio do servidor por prop).

**Tech Stack:** Next.js App Router, Prisma/Postgres, Zod, react-hook-form, Vitest.

## Global Constraints

- Variável de template desconhecida é erro **ao salvar**, nunca string vazia ao renderizar.
- `{{assinatura.senha}}` nunca pode existir como variável válida — coberto pela whitelist fechada, sem lista negra separada.
- `core/dunning-template.ts` não importa Prisma, Next, `process.env` nem chama `new Date()`.
- `@@unique([ruleId, offsetDays])` e o índice único parcial de `isDefault` são a trava real — teste de constraint insere de verdade contra Postgres.
- Zero cálculo de negócio na Server Action; Server Action ≤30 linhas; `service.ts` ≤250 linhas; `page.tsx` ≤100 linhas.
- Toda entrada de Server Action passa por Zod.
- `DunningExecution` **não é criado nesta spec** — `DunningStep` fica sem a relação `executions` até a Etapa 4 adicionar via migration aditiva.
- Texto de UI e mensagens de erro em pt-BR.
- Spec fonte: `docs/superpowers/specs/2026-08-08-regua-minima-templates-design.md`.

---

### Task 1: Migration — `DunningRule` + `DunningStep`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000006_dunning_rule_step/migration.sql`

**Interfaces:**
- Produces: enums `DunningStatus = DRAFT|REVIEW|ACTIVE|PAUSED`, `DunningAction = SEND_MESSAGE|SUSPEND|NOTIFY_OWNER`; modelos `DunningRule` (`id, name, status, isDefault, createdAt, updatedAt`) e `DunningStep` (`id, ruleId, offsetDays, action, templateBody, isActive`).

- [ ] **Step 1: Editar `prisma/schema.prisma`**

```prisma
enum DunningStatus {
  DRAFT
  REVIEW
  ACTIVE
  PAUSED
}

enum DunningAction {
  SEND_MESSAGE
  SUSPEND
  NOTIFY_OWNER
}

model DunningRule {
  id        String        @id @default(uuid(7))
  name      String
  status    DunningStatus @default(DRAFT)
  isDefault Boolean       @default(false)
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  steps     DunningStep[]

  @@map("dunning_rules")
}

model DunningStep {
  id           String        @id @default(uuid(7))
  ruleId       String
  offsetDays   Int
  action       DunningAction @default(SEND_MESSAGE)
  templateBody String?
  isActive     Boolean       @default(true)

  rule         DunningRule   @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@unique([ruleId, offsetDays])
  @@map("dunning_steps")
}
```

- [ ] **Step 2: Gerar a migration**

Run: `pnpm prisma migrate dev --name dunning_rule_step --create-only`

Renomeie a pasta gerada para `00000000000006_dunning_rule_step` (sequência após `00000000000005_channel_config`).

- [ ] **Step 3: Acrescentar o SQL manual no fim do arquivo gerado**

```sql
-- No máximo uma régua padrão
CREATE UNIQUE INDEX dunning_rules_single_default ON dunning_rules ("isDefault")
  WHERE "isDefault" = true;
```

Confirme o nome real da coluna (`"isDefault"` vs `is_default`) olhando o `CREATE TABLE` que o Prisma gerou logo acima nesse mesmo arquivo — este schema não usa `@map` por campo, então deve ser `"isDefault"` (mesmo padrão de `channel_configs`), mas verifique antes de fechar o índice.

- [ ] **Step 4: Aplicar e gerar o client**

Run: `pnpm prisma migrate dev`
Run: `pnpm prisma generate`

Expected: `db.dunningRule` e `db.dunningStep` disponíveis no client gerado.

- [ ] **Step 5: Confirmar a constraint no banco de verdade**

Via `psql`/`prisma db execute`: insira duas `DunningRule` com `isDefault: true` e confirme que a segunda falha por violação do índice único. Limpe as duas linhas depois.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add DunningRule and DunningStep models with single-default constraint"
```

---

### Task 2: `core/dunning-template.ts`

**Files:**
- Create: `src/core/dunning-template.ts`
- Test: `src/core/dunning-template.test.ts`

**Interfaces:**
- Produces: `TEMPLATE_VARIABLES` (array de 7 strings), `TemplateVariable`, `TemplateContext = Record<TemplateVariable, string>`, `extractTemplateVariables(text: string): string[]`, `assertKnownVariables(text: string): void` (lança `Error` com as variáveis inválidas na mensagem), `renderTemplate(text: string, context: TemplateContext): string`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/core/dunning-template.test.ts
import { describe, expect, it } from 'vitest';
import { extractTemplateVariables, assertKnownVariables, renderTemplate } from './dunning-template';

describe('extractTemplateVariables', () => {
  it('extrai zero variáveis de texto sem {{}}', () => {
    expect(extractTemplateVariables('Olá! Sua cobrança venceu.')).toEqual([]);
  });

  it('extrai uma variável', () => {
    expect(extractTemplateVariables('Olá {{cliente.primeiro_nome}}!')).toEqual(['cliente.primeiro_nome']);
  });

  it('extrai múltiplas variáveis, preservando repetição', () => {
    const text = '{{cliente.nome}} deve {{cobranca.valor}}, use {{pix.chave}}. Confirma, {{cliente.nome}}?';
    expect(extractTemplateVariables(text)).toEqual([
      'cliente.nome', 'cobranca.valor', 'pix.chave', 'cliente.nome',
    ]);
  });
});

describe('assertKnownVariables', () => {
  it('aceita as 7 variáveis da whitelist', () => {
    const text = `{{cliente.primeiro_nome}} {{cliente.nome}} {{cobranca.valor}}
      {{cobranca.vencimento}} {{cobranca.dias_atraso}} {{pix.chave}} {{negocio.nome}}`;
    expect(() => assertKnownVariables(text)).not.toThrow();
  });

  it('rejeita variável desconhecida', () => {
    expect(() => assertKnownVariables('Olá {{cliente.apelido}}')).toThrow(/cliente.apelido/);
  });

  it('rejeita {{assinatura.senha}} — nunca pode existir como variável válida', () => {
    expect(() => assertKnownVariables('Sua senha é {{assinatura.senha}}')).toThrow(/assinatura.senha/);
  });

  it('texto sem variável nenhuma passa', () => {
    expect(() => assertKnownVariables('Texto fixo sem chave.')).not.toThrow();
  });
});

describe('renderTemplate', () => {
  const context = {
    'cliente.primeiro_nome': 'João',
    'cliente.nome': 'João Silva',
    'cobranca.valor': 'R$ 60,00',
    'cobranca.vencimento': '10/08',
    'cobranca.dias_atraso': '3',
    'pix.chave': 'chave-pix-exemplo',
    'negocio.nome': 'MT Conexões',
  } as const;

  it('substitui uma ocorrência', () => {
    expect(renderTemplate('Olá {{cliente.primeiro_nome}}!', context)).toBe('Olá João!');
  });

  it('substitui todas as ocorrências repetidas da mesma variável', () => {
    expect(renderTemplate('{{cliente.nome}}, {{cliente.nome}}!', context)).toBe('João Silva, João Silva!');
  });

  it('substitui múltiplas variáveis diferentes', () => {
    const text = 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence {{cobranca.vencimento}}. Pix: {{pix.chave}}';
    expect(renderTemplate(text, context)).toBe('Olá João! Sua renovação de R$ 60,00 vence 10/08. Pix: chave-pix-exemplo');
  });

  it('texto sem variável retorna igual', () => {
    expect(renderTemplate('Texto fixo.', context)).toBe('Texto fixo.');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/core/dunning-template.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/core/dunning-template.ts
export const TEMPLATE_VARIABLES = [
  'cliente.primeiro_nome',
  'cliente.nome',
  'cobranca.valor',
  'cobranca.vencimento',
  'cobranca.dias_atraso',
  'pix.chave',
  'negocio.nome',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateContext = Record<TemplateVariable, string>;

const VARIABLE_PATTERN = /\{\{([^{}]+)\}\}/g;

export function extractTemplateVariables(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1].trim());
}

export function assertKnownVariables(text: string): void {
  const known = new Set<string>(TEMPLATE_VARIABLES);
  const unknown = extractTemplateVariables(text).filter((v) => !known.has(v));
  if (unknown.length > 0) {
    throw new Error(`Variável de template desconhecida: ${[...new Set(unknown)].join(', ')}`);
  }
}

export function renderTemplate(text: string, context: TemplateContext): string {
  return text.replace(VARIABLE_PATTERN, (match, rawVariable) => {
    const variable = rawVariable.trim() as TemplateVariable;
    return variable in context ? context[variable] : match;
  });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/core/dunning-template.test.ts`
Expected: PASS, todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/core/dunning-template.ts src/core/dunning-template.test.ts
git commit -m "feat(core): add pure template variable extraction, validation and render"
```

---

### Task 3: Seed da régua padrão

**Files:**
- Modify: `prisma/seed.ts`

**Interfaces:**
- Consumes: `db.dunningRule`, `db.dunningStep` (Task 1).

- [ ] **Step 1: Adicionar ao `main()` de `prisma/seed.ts`, depois do bloco de `settings`**

```ts
    const defaultRule = await db.dunningRule.upsert({
      where: { id: 'default-rule' },
      update: {},
      create: {
        id: 'default-rule',
        name: 'Régua padrão',
        status: 'REVIEW',
        isDefault: true,
      },
    });

    const DEFAULT_STEPS: { offsetDays: number; action: 'SEND_MESSAGE' | 'SUSPEND'; templateBody: string | null }[] = [
      { offsetDays: -5, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence em breve, dia {{cobranca.vencimento}}.\n\n{{negocio.nome}}' },
      { offsetDays: -2, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence dia {{cobranca.vencimento}}.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 0, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence hoje ({{cobranca.vencimento}}).\n\nPix: {{pix.chave}}\n\nQualquer dúvida, é só responder aqui.\n{{negocio.nome}}' },
      { offsetDays: 1, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}, sua renovação de {{cobranca.valor}} está {{cobranca.dias_atraso}} dia(s) atrasada.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 3, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}, último aviso: sua renovação de {{cobranca.valor}} está {{cobranca.dias_atraso}} dia(s) atrasada e o acesso pode ser suspenso.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 5, action: 'SUSPEND', templateBody: null },
    ];

    for (const step of DEFAULT_STEPS) {
      await db.dunningStep.upsert({
        where: { ruleId_offsetDays: { ruleId: defaultRule.id, offsetDays: step.offsetDays } },
        update: {},
        create: { ruleId: defaultRule.id, ...step },
      });
    }
    console.log(`[seed] régua padrão pronta: ${defaultRule.name} (${DEFAULT_STEPS.length} passos)`);
```

- [ ] **Step 2: Rodar o seed duas vezes e confirmar idempotência**

Run: `pnpm db:seed`
Run: `pnpm db:seed` (de novo)
Expected: segunda rodada não cria linhas duplicadas — confira com `SELECT COUNT(*) FROM dunning_steps;` (deve ser 6) e `SELECT COUNT(*) FROM dunning_rules;` (deve ser 1).

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): seed default pre-paid dunning rule with 6 steps"
```

---

### Task 4: `features/dunning/schema.ts`

**Files:**
- Create: `src/features/dunning/schema.ts`

**Interfaces:**
- Produces: `dunningStepSchema` (Zod), tipo `DunningStepInput`.

- [ ] **Step 1: Implementar**

```ts
// src/features/dunning/schema.ts
import { z } from 'zod';

export const dunningStepSchema = z.object({
  offsetDays: z.coerce.number().int('Deslocamento precisa ser um número inteiro.'),
  action: z.enum(['SEND_MESSAGE', 'SUSPEND', 'NOTIFY_OWNER']),
  templateBody: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type DunningStepInput = z.infer<typeof dunningStepSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/dunning/schema.ts
git commit -m "feat(dunning): add dunningStepSchema"
```

---

### Task 5: `features/dunning/queries.ts`

**Files:**
- Create: `src/features/dunning/queries.ts`
- Test: `src/features/dunning/queries.integration.test.ts`

**Interfaces:**
- Produces: `DunningStepDTO`, `DunningRuleDTO`, `getDefaultRuleWithSteps(): Promise<DunningRuleDTO & { steps: DunningStepDTO[] }>`, `PreviewChargeDTO`, `listRecentChargesForPreview(limit?: number): Promise<PreviewChargeDTO[]>`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/dunning/queries.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { getDefaultRuleWithSteps, listRecentChargesForPreview } from './queries';

describe('getDefaultRuleWithSteps', () => {
  it('devolve a régua padrão seedada com os passos ordenados por offsetDays', async () => {
    const rule = await getDefaultRuleWithSteps();

    expect(rule.isDefault).toBe(true);
    expect(rule.steps.length).toBeGreaterThanOrEqual(6);
    const offsets = rule.steps.map((s) => s.offsetDays);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe('listRecentChargesForPreview', () => {
  it('nunca estoura mesmo sem nenhuma cobrança no banco além das existentes, e respeita o limite', async () => {
    const rows = await listRecentChargesForPreview(2);
    expect(rows.length).toBeLessThanOrEqual(2);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('customerName');
      expect(rows[0]).toHaveProperty('netCents');
      expect(rows[0]).toHaveProperty('dueAt');
    }
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/dunning/queries.integration.test.ts`
Expected: FAIL — `./queries` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/dunning/queries.ts
import { db } from '@/lib/db';

export interface DunningStepDTO {
  id: string;
  offsetDays: number;
  action: string;
  templateBody: string | null;
  isActive: boolean;
}

export interface DunningRuleDTO {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
}

export async function getDefaultRuleWithSteps(): Promise<DunningRuleDTO & { steps: DunningStepDTO[] }> {
  const rule = await db.dunningRule.findFirstOrThrow({
    where: { isDefault: true },
    include: { steps: { orderBy: { offsetDays: 'asc' } } },
  });
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    isDefault: rule.isDefault,
    steps: rule.steps.map((s) => ({
      id: s.id,
      offsetDays: s.offsetDays,
      action: s.action,
      templateBody: s.templateBody,
      isActive: s.isActive,
    })),
  };
}

export interface PreviewChargeDTO {
  id: string;
  customerName: string;
  netCents: string;
  dueAt: string;
}

export async function listRecentChargesForPreview(limit = 10): Promise<PreviewChargeDTO[]> {
  const rows = await db.charge.findMany({
    take: limit,
    orderBy: { issuedAt: 'desc' },
    include: { customer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer.name,
    netCents: (row.principalCents - row.discountCents).toString(),
    dueAt: row.dueAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS. Se `getDefaultRuleWithSteps` falhar por não achar régua, confirme que a Task 3 (seed) já rodou no banco de teste — a suíte de integração espera o seed aplicado, mesmo padrão de `src/features/customers/queries.integration.test.ts` que já assume dados de setup.

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/queries.ts src/features/dunning/queries.integration.test.ts
git commit -m "feat(dunning): add getDefaultRuleWithSteps and listRecentChargesForPreview queries"
```

---

### Task 6: `features/dunning/service.ts`

**Files:**
- Create: `src/features/dunning/service.ts`
- Test: `src/features/dunning/service.integration.test.ts`

**Interfaces:**
- Consumes: `assertKnownVariables` de `@/core/dunning-template` (Task 2), `dunningStepSchema`/`DunningStepInput` (Task 4), `DomainError` de `@/lib/errors`.
- Produces: `createStep(ruleId, input)`, `updateStep(id, input)`, `deleteStep(id)`; erros `UnknownTemplateVariableError`, `DuplicateStepOffsetError`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/dunning/service.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createStep, updateStep, deleteStep, UnknownTemplateVariableError, DuplicateStepOffsetError } from './service';

let ruleId: string;

afterEach(async () => {
  await db.dunningStep.deleteMany({ where: { offsetDays: { in: [42, 43] } } });
});

describe('createStep', () => {
  it('rejeita variável desconhecida antes de tocar o banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await expect(
      createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.apelido}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);

    const created = await db.dunningStep.findFirst({ where: { ruleId, offsetDays: 42 } });
    expect(created).toBeNull();
  });

  it('cria passo com template válido', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    const step = await createStep(ruleId, { offsetDays: 43, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}', isActive: true });

    expect(step.offsetDays).toBe(43);
  });

  it('dois passos com o mesmo offsetDays na mesma régua batem na constraint do banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Outro {{negocio.nome}}', isActive: true }),
    ).rejects.toThrow(DuplicateStepOffsetError);
  });
});

describe('updateStep', () => {
  it('re-valida o template ao atualizar', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      updateStep(step.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{variavel.inexistente}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);
  });
});

describe('deleteStep', () => {
  it('remove o passo', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await deleteStep(step.id);

    const found = await db.dunningStep.findUnique({ where: { id: step.id } });
    expect(found).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/dunning/service.integration.test.ts`
Expected: FAIL — `./service` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/dunning/service.ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { assertKnownVariables } from '@/core/dunning-template';
import type { DunningStepInput } from './schema';

export class UnknownTemplateVariableError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, 'UNKNOWN_TEMPLATE_VARIABLE', { cause });
  }
}

export class DuplicateStepOffsetError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um passo com esse deslocamento nesta régua.', 'DUPLICATE_STEP_OFFSET', { cause });
  }
}

function validateTemplate(templateBody: string | undefined): void {
  if (!templateBody) return;
  try {
    assertKnownVariables(templateBody);
  } catch (err) {
    throw new UnknownTemplateVariableError(err instanceof Error ? err.message : 'Variável de template desconhecida.', err);
  }
}

export async function createStep(ruleId: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.create({
      data: { ruleId, offsetDays: input.offsetDays, action: input.action, templateBody: input.templateBody ?? null, isActive: input.isActive },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function updateStep(id: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.update({
      where: { id },
      data: { offsetDays: input.offsetDays, action: input.action, templateBody: input.templateBody ?? null, isActive: input.isActive },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function deleteStep(id: string) {
  await db.dunningStep.delete({ where: { id } });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/dunning/service.ts src/features/dunning/service.integration.test.ts
git commit -m "feat(dunning): add step CRUD service with template validation"
```

---

### Task 7: `features/dunning/actions.ts`

**Files:**
- Create: `src/features/dunning/actions.ts`

**Interfaces:**
- Consumes: `dunningStepSchema` (Task 4), `createStep`/`updateStep`/`deleteStep` (Task 6), `requireSession` de `@/features/auth/service`, `DomainError`, `logger`.
- Produces: `createDunningStepAction(ruleId, input)`, `updateDunningStepAction(id, input)`, `deleteDunningStepAction(id)`.

- [ ] **Step 1: Implementar** (mesmo padrão de `features/suppliers/actions.ts`)

```ts
// src/features/dunning/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { dunningStepSchema } from './schema';
import { createStep, updateStep, deleteStep } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function createDunningStepAction(ruleId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = dunningStepSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await createStep(ruleId, parsed.data);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.createStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateDunningStepAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = dunningStepSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await updateStep(id, parsed.data);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.updateStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function deleteDunningStepAction(id: string): Promise<ActionResult> {
  try {
    await requireSession();
    await deleteStep(id);
    revalidatePath('/regua');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'dunning.deleteStep', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/dunning/actions.ts
git commit -m "feat(dunning): add step CRUD Server Actions"
```

---

### Task 8: Labels e mensagens pt-BR

**Files:**
- Modify: `src/lib/messages.ts`
- Modify: `src/lib/labels.ts`

**Interfaces:**
- Produces: `messages.dunning.{stepCreated, stepUpdated, stepDeleted}`; `DUNNING_ACTION_OPTIONS`, `DUNNING_ACTION_LABELS`, `DUNNING_STATUS_LABELS`.

- [ ] **Step 1: Adicionar em `messages.ts`, ao lado de `messaging`**

```ts
  dunning: {
    stepCreated: 'Passo criado.',
    stepUpdated: 'Passo atualizado.',
    stepDeleted: 'Passo removido.',
  },
```

- [ ] **Step 2: Adicionar em `labels.ts`, ao final do arquivo**

```ts
export const DUNNING_ACTION_OPTIONS = [
  { value: 'SEND_MESSAGE', label: 'Enviar mensagem' },
  { value: 'SUSPEND', label: 'Suspender assinatura' },
  { value: 'NOTIFY_OWNER', label: 'Notificar operador' },
] as const;

export const DUNNING_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  DUNNING_ACTION_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const DUNNING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  REVIEW: 'Em revisão',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
};
```

- [ ] **Step 3: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages.ts src/lib/labels.ts
git commit -m "feat(dunning): add pt-BR labels and toast messages for dunning steps"
```

---

### Task 9: `TemplatePreview` (client)

**Files:**
- Create: `src/features/dunning/components/template-preview.tsx`

**Interfaces:**
- Consumes: `renderTemplate`, `TemplateContext` de `@/core/dunning-template`, `PreviewChargeDTO` (Task 5), `formatCents`/`formatLocalDate` de `@/lib/format`.
- Produces: `TemplatePreview({ templateBody, charges, settings })`.

- [ ] **Step 1: Implementar**

```tsx
// src/features/dunning/components/template-preview.tsx
'use client';

import { useState } from 'react';
import { renderTemplate, type TemplateContext } from '@/core/dunning-template';
import { formatCents, formatLocalDate } from '@/lib/format';
import type { PreviewChargeDTO } from '../queries';

function daysOverdue(dueAtIso: string, timezone: string): number {
  const due = new Date(dueAtIso);
  const now = new Date();
  const diffMs = now.getTime() - due.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

export function TemplatePreview({
  templateBody,
  charges,
  settings,
}: {
  templateBody: string;
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const [chargeId, setChargeId] = useState(charges[0]?.id ?? '');
  const charge = charges.find((c) => c.id === chargeId);

  if (charges.length === 0) {
    return (
      <div className="rounded-sm border border-border bg-surface-elevated p-3 text-sm text-foreground-muted">
        Nenhuma cobrança cadastrada ainda pra pré-visualizar — o texto abaixo mostra as variáveis sem substituir.
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-foreground">{templateBody}</pre>
      </div>
    );
  }

  const firstName = charge?.customerName.split(' ')[0] ?? '';
  const context: TemplateContext = {
    'cliente.primeiro_nome': firstName,
    'cliente.nome': charge?.customerName ?? '',
    'cobranca.valor': charge ? formatCents(charge.netCents) : '',
    'cobranca.vencimento': charge ? formatLocalDate(charge.dueAt, settings.timezone) : '',
    'cobranca.dias_atraso': charge ? String(daysOverdue(charge.dueAt, settings.timezone)) : '0',
    'pix.chave': settings.pixKey ?? '',
    'negocio.nome': settings.businessName,
  };

  return (
    <div className="rounded-sm border border-border bg-surface-elevated p-3">
      <select
        aria-label="Cobrança pra prévia"
        value={chargeId}
        onChange={(e) => setChargeId(e.target.value)}
        className="mb-2 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm text-foreground"
      >
        {charges.map((c) => (
          <option key={c.id} value={c.id}>
            {c.customerName} — {formatCents(c.netCents)}
          </option>
        ))}
      </select>
      <pre className="whitespace-pre-wrap font-sans text-sm text-foreground">{renderTemplate(templateBody, context)}</pre>
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/dunning/components/template-preview.tsx
git commit -m "feat(dunning): add TemplatePreview rendering against a real charge"
```

---

### Task 10: `StepDrawer` + `StepList` (client)

**Files:**
- Create: `src/features/dunning/components/step-drawer.tsx`
- Create: `src/features/dunning/components/step-list.tsx`

**Interfaces:**
- Consumes: `dunningStepSchema` (Task 4), `createDunningStepAction`/`updateDunningStepAction`/`deleteDunningStepAction` (Task 7), `TemplatePreview` (Task 9), `DunningStepDTO`/`PreviewChargeDTO` (Task 5), `ConfirmDialog` de `@/components/ui/confirm-dialog`, `DUNNING_ACTION_OPTIONS`/`DUNNING_ACTION_LABELS` (Task 8).
- Produces: `StepDrawer`, `StepList`.

- [ ] **Step 1: Implementar `step-drawer.tsx`**

```tsx
// src/features/dunning/components/step-drawer.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { dunningStepSchema } from '../schema';
import { createDunningStepAction, updateDunningStepAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { DUNNING_ACTION_OPTIONS } from '@/lib/labels';
import { TemplatePreview } from './template-preview';
import type { DunningStepDTO, PreviewChargeDTO } from '../queries';

type FormValues = z.input<typeof dunningStepSchema>;

export function StepDrawer({
  open,
  onOpenChange,
  ruleId,
  step,
  charges,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleId: string;
  step: DunningStepDTO | null;
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(dunningStepSchema),
    values: step
      ? { offsetDays: step.offsetDays, action: step.action as FormValues['action'], templateBody: step.templateBody ?? '', isActive: step.isActive }
      : { offsetDays: 0, action: 'SEND_MESSAGE', templateBody: '', isActive: true },
  });

  const templateBody = watch('templateBody') ?? '';

  async function onSubmit(values: FormValues) {
    const result = step
      ? await updateDunningStepAction(step.id, values)
      : await createDunningStepAction(ruleId, values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(step ? messages.dunning.stepUpdated : messages.dunning.stepCreated);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step ? `Passo D${step.offsetDays >= 0 ? '+' : ''}${step.offsetDays}` : 'Novo passo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="offsetDays">Deslocamento (dias, negativo = antes do vencimento)</label>
            <input id="offsetDays" type="number" {...register('offsetDays')} className="mt-1 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm" />
            {errors.offsetDays && <p className="mt-1 text-xs text-danger">{errors.offsetDays.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="action">Ação</label>
            <select id="action" {...register('action')} className="mt-1 h-9 w-full rounded-sm border border-border bg-surface px-2 text-sm">
              {DUNNING_ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground" htmlFor="templateBody">Texto (com variáveis {'{{...}}'})</label>
            <textarea id="templateBody" {...register('templateBody')} rows={5} className="mt-1 w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-sm" />
            {errors.templateBody && <p className="mt-1 text-xs text-danger">{errors.templateBody.message}</p>}
          </div>
          {templateBody && (
            <div>
              <p className="mb-1 text-sm font-medium text-foreground">Prévia</p>
              <TemplatePreview templateBody={templateBody} charges={charges} settings={settings} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-foreground-muted">
            <input type="checkbox" {...register('isActive')} />
            Passo ativo
          </label>
          <Button type="submit" disabled={isSubmitting}>Salvar</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implementar `step-list.tsx`**

```tsx
// src/features/dunning/components/step-list.tsx
'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { DUNNING_ACTION_LABELS } from '@/lib/labels';
import { deleteDunningStepAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { StepDrawer } from './step-drawer';
import type { DunningStepDTO, PreviewChargeDTO } from '../queries';

export function StepList({
  ruleId,
  steps,
  charges,
  settings,
}: {
  ruleId: string;
  steps: DunningStepDTO[];
  charges: PreviewChargeDTO[];
  settings: { timezone: string; pixKey: string | null; businessName: string };
}) {
  const [editing, setEditing] = useState<DunningStepDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleting, setDeleting] = useState<DunningStepDTO | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    const result = await deleteDunningStepAction(deleting.id);
    if ('error' in result) toastError(result.error);
    else toastSuccess(messages.dunning.stepDeleted);
    setDeleting(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
          <Plus size={16} /> Novo passo
        </Button>
      </div>
      {steps.map((step) => (
        <div key={step.id} className="flex items-center justify-between rounded-sm border border-border bg-surface p-4">
          <div>
            <p className="font-bold text-foreground">D{step.offsetDays >= 0 ? '+' : ''}{step.offsetDays} — {DUNNING_ACTION_LABELS[step.action] ?? step.action}</p>
            {step.templateBody && <p className="mt-1 line-clamp-1 text-sm text-foreground-muted">{step.templateBody}</p>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={step.isActive ? 'success' : 'neutral'}>{step.isActive ? 'Ativo' : 'Inativo'}</StatusBadge>
            <button type="button" onClick={() => { setEditing(step); setDrawerOpen(true); }} aria-label="Editar passo" className="rounded-sm p-1.5 text-foreground-muted hover:text-foreground">
              <Pencil size={16} />
            </button>
            <button type="button" onClick={() => setDeleting(step)} aria-label="Remover passo" className="rounded-sm p-1.5 text-foreground-muted hover:text-danger">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <StepDrawer open={drawerOpen} onOpenChange={setDrawerOpen} ruleId={ruleId} step={editing} charges={charges} settings={settings} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remover passo"
        description={`Tem certeza que quer remover o passo D${deleting && deleting.offsetDays >= 0 ? '+' : ''}${deleting?.offsetDays}? Essa ação não pode ser desfeita.`}
        confirmLabel="Remover"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
```

- [ ] **Step 3: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros. Confirme antes se `Input`/`Label` de `components/ui` não são obrigatórios aqui — este componente usa `<input>`/`<select>`/`<textarea>` crus com Tailwind, seguindo o padrão já usado em `charge-filters.tsx`; se preferir usar `@/components/ui/input` e `@/components/ui/label` (como `channel-credentials-dialog.tsx` fez), a troca é direta, mas não é obrigatória — ambos os padrões coexistem no projeto hoje.

- [ ] **Step 4: Commit**

```bash
git add src/features/dunning/components/step-drawer.tsx src/features/dunning/components/step-list.tsx
git commit -m "feat(dunning): add StepDrawer and StepList components"
```

---

### Task 11: Rota `/regua`

**Files:**
- Create: `src/app/(app)/regua/page.tsx`

**Interfaces:**
- Consumes: `getDefaultRuleWithSteps`/`listRecentChargesForPreview` (Task 5), `getSettings` de `@/features/settings/queries`, `StepList` (Task 10), `AppShell` de `@/components/layout/app-shell`, `StatusBadge`, `DUNNING_STATUS_LABELS` (Task 8).

- [ ] **Step 1: Implementar**

```tsx
// src/app/(app)/regua/page.tsx
import { AppShell } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { getDefaultRuleWithSteps, listRecentChargesForPreview } from '@/features/dunning/queries';
import { getSettings } from '@/features/settings/queries';
import { StepList } from '@/features/dunning/components/step-list';
import { DUNNING_STATUS_LABELS } from '@/lib/labels';

export default async function DunningRulePage() {
  const [rule, charges, settings] = await Promise.all([
    getDefaultRuleWithSteps(),
    listRecentChargesForPreview(),
    getSettings(),
  ]);

  return (
    <AppShell title="Régua de cobrança">
      <div className="mb-4 flex items-center gap-2">
        <p className="text-sm text-foreground-muted">{rule.name}</p>
        <StatusBadge tone={rule.status === 'ACTIVE' ? 'success' : 'warning'}>
          {DUNNING_STATUS_LABELS[rule.status] ?? rule.status}
        </StatusBadge>
      </div>
      <StepList
        ruleId={rule.id}
        steps={rule.steps}
        charges={charges}
        settings={{ timezone: settings.timezone, pixKey: settings.pixKey, businessName: settings.businessName }}
      />
    </AppShell>
  );
}
```

- [ ] **Step 2: Rodar o gate completo**

Run: `pnpm tsc --noEmit`
Run: `pnpm lint`
Run: `pnpm test`
Run: `pnpm test:integration`
Expected: todos passam, sem warning novo.

- [ ] **Step 3: Commit**

```bash
git add src/app/'(app)'/regua/page.tsx
git commit -m "feat(dunning): add /regua page listing steps with edit/preview"
```

---

## Self-review (spec coverage)

| Item da spec | Task |
|---|---|
| Migration `DunningRule`/`DunningStep` + índice único parcial | 1 |
| `core/dunning-template.ts` puro | 2 |
| Seed idempotente da régua padrão (6 passos) | 3 |
| `dunningStepSchema` | 4 |
| `getDefaultRuleWithSteps` / `listRecentChargesForPreview` | 5 |
| `createStep`/`updateStep`/`deleteStep` com validação de variável | 6 |
| Server Actions finas | 7 |
| Labels pt-BR | 8 |
| `TemplatePreview` com cobrança real | 9 |
| `StepDrawer`/`StepList` | 10 |
| Rota `/regua` (sidebar já tinha o item, sem mudança) | 11 |

Fora de escopo, confirmado: `dunning-evaluate`, `messages-dispatch`, `DunningExecution`, travas T5–T8, modo revisão com as 3 opções de ativação — nenhuma task aqui os toca.
