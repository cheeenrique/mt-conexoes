# Etapa 3c-1 — Envio manual assistido + timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Envio manual de WhatsApp síncrono (sem fila), respeitando opt-out e quiet hours, mais a timeline de mensagens na ficha do cliente — fecha o critério de pronto da Etapa 3 ("mensagem real chega no WhatsApp").

**Architecture:** `features/messaging/dispatch.ts` orquestra: valida template (`core/dunning-template.ts`), resolve canal padrão, checa quiet hours (`core/dates.ts`), filtra opt-out/sem telefone, deduplica, envia sequencial via `resolveAdapter(provider).send()`, grava `Message` por destinatário com o resultado real. UI composta em `app/(app)/charges/page.tsx` (botão+dialog de `features/messaging/components/`) e `app/(app)/customers/[id]/page.tsx` (timeline).

**Tech Stack:** Next.js App Router, Prisma/Postgres, Zod, react-hook-form, Vitest.

## Global Constraints

- Envio é **síncrono, sem fila** — fora de quiet hours, a ação inteira é recusada (nunca reagenda). Reagendamento real é Etapa 4.
- Opt-out (`Customer.optedOut`) e **cliente sem telefone** (`Customer.phone === null`) nunca geram `Message` — excluídos silenciosamente, contados no resumo do resultado (spec original só previa opt-out; sem telefone é extensão necessária, mesmo tratamento de `dunning-evaluate` no doc 06 para o caso `no_phone`).
- Dedupe por `customerId` acontece no service, não confia só na UI.
- Envio é **sequencial** (`for...of` com `await`), nunca `Promise.all` — respeita `rateLimitPerMinute` do adapter.
- Falha num destinatário não derruba os seguintes — cada `Message` é seu próprio `create`, sem transação cobrindo o lote inteiro.
- `UnknownTemplateVariableError` é usado por 2 features agora (`dunning` e `messaging`) — promovido pra `lib/errors.ts` antes do dispatch existir (regra de reuso: 2ª feature precisa → sobe de lugar).
- Zero `if (provider === ...)` fora de `features/messaging/channels/`.
- `now` entra por parâmetro em `dispatch.ts` (testável), nasce com `new Date()` só na Server Action (a borda).
- Toda entrada de Server Action passa por Zod.
- `core/` continua puro — o novo helper de quiet hours não chama `new Date()`, `timezone`/`instant` entram por parâmetro.
- Texto de UI e mensagens de erro em pt-BR.
- Spec fonte: `docs/superpowers/specs/2026-08-08-etapa-3c1-envio-manual-timeline-design.md`.
- **Correção de escopo em relação à spec**: a spec original descreve a tela mostrando a contagem de excluídos por opt-out *antes* da confirmação (preflight). Esta implementação simplifica para pós-confirmação: o dialog mostra a lista de destinatários com prévia (nome/telefone não são checados client-side), o envio roda, e o resumo (`sent`/`failed`/`skippedOptedOut`/`skippedNoPhone`) aparece no resultado. Isso evita uma segunda chamada ao servidor só para "dry-run" e mantém o fluxo em uma única submissão — T5/T6 continuam vetando o envio de verdade, só a exibição prévia do count muda de momento.

---

### Task 1: Migration — `Message` + `MessageKind`/`MessageStatus` + dedupe diária

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000007_messages/migration.sql`

**Interfaces:**
- Produces: enums `MessageKind = DUNNING|MANUAL|TEST`, `MessageStatus = PENDING|SENT|FAILED|CANCELLED|SKIPPED`; modelo `Message` (campos listados no schema abaixo).

- [ ] **Step 1: Editar `prisma/schema.prisma`**

```prisma
enum MessageKind {
  DUNNING
  MANUAL
  TEST
}

enum MessageStatus {
  PENDING
  SENT
  FAILED
  CANCELLED
  SKIPPED
}

model Message {
  id            String         @id @default(uuid(7))
  customerId    String
  chargeId      String?
  channelId     String?
  kind          MessageKind    @default(DUNNING)
  status        MessageStatus  @default(PENDING)

  toPhone       String
  body          String
  scheduledFor  DateTime
  scheduledDate DateTime       @db.Date
  sentAt        DateTime?
  externalId    String?
  attempts      Int            @default(0)
  failReason    String?
  cancelReason  String?
  createdAt     DateTime       @default(now())

  customer      Customer       @relation(fields: [customerId], references: [id])
  charge        Charge?        @relation(fields: [chargeId], references: [id])
  channel       ChannelConfig? @relation(fields: [channelId], references: [id])

  @@index([status, scheduledFor])
  @@index([customerId, createdAt])
  @@map("messages")
}
```

Adicionar `messages Message[]` como relação inversa em `Customer`, `Charge` e
`ChannelConfig` (procurar cada `model` no arquivo e adicionar o campo, seguindo o
padrão já usado pelas outras relações inversas desses três modelos).

- [ ] **Step 2: Gerar a migration**

Run: `pnpm prisma migrate dev --name messages --create-only`

Renomeie a pasta gerada para `00000000000007_messages` (sequência após
`00000000000006_dunning_rule_step`).

- [ ] **Step 3: Acrescentar o SQL manual no fim do arquivo gerado**

```sql
-- T7: um customer recebe no máximo uma mensagem de cobrança por dia
CREATE UNIQUE INDEX messages_dunning_daily_dedupe
  ON messages ("customerId", "scheduledDate")
  WHERE kind = 'DUNNING' AND status <> 'CANCELLED';
```

Confirme os nomes reais das colunas (`"customerId"`/`"scheduledDate"` vs snake_case)
olhando o `CREATE TABLE` gerado no mesmo arquivo, mesma checagem das migrations
anteriores — este schema não usa `@map` por campo.

- [ ] **Step 4: Aplicar e gerar o client**

Run: `pnpm prisma migrate dev`
Run: `pnpm prisma generate`

Expected: `db.message` disponível, `MessageKind`/`MessageStatus` exportados.

- [ ] **Step 5: Confirmar a constraint no banco de verdade**

Via `psql`/`prisma db execute`: crie um `Customer` de teste, insira duas `Message`
`kind: 'DUNNING'` para o mesmo `customerId` e `scheduledDate`, confirme que a segunda
falha por violação do índice único. Confirme que a mesma inserção com `kind:
'MANUAL'` **não falha** (a `WHERE` só cobre `DUNNING`). Limpe as linhas de teste
depois.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add Message model with DUNNING daily-dedupe constraint"
```

---

### Task 2: Promover `UnknownTemplateVariableError` pra `lib/errors.ts`

**Files:**
- Modify: `src/lib/errors.ts`
- Modify: `src/features/dunning/service.ts`

**Interfaces:**
- Produces: `UnknownTemplateVariableError` agora exportado de `@/lib/errors`.
- Consumes (pra confirmar nada quebrou): `src/features/dunning/service.integration.test.ts` já testa esse erro — deve continuar passando sem alteração no próprio teste, só no import de onde a classe vem se o teste a importar diretamente (verificar).

- [ ] **Step 1: Mover a classe**

Em `src/lib/errors.ts`, adicionar ao final:

```ts
export class UnknownTemplateVariableError extends DomainError {
  constructor(message: string, cause?: unknown) {
    super(message, 'UNKNOWN_TEMPLATE_VARIABLE', { cause });
  }
}
```

Em `src/features/dunning/service.ts`: remover a definição local de
`UnknownTemplateVariableError` (a classe, não o uso) e importar de `@/lib/errors` em
vez disso — `import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';`
(ajustar conforme os outros imports já existentes do arquivo). Manter
`DuplicateStepOffsetError` onde está — essa é específica de `dunning`, só uma feature
usa.

- [ ] **Step 2: Rodar os testes que cobrem essa classe**

Run: `pnpm test:integration -- src/features/dunning/service.integration.test.ts`
Expected: PASS, sem alteração de comportamento — só o import mudou de lugar.

- [ ] **Step 3: Rodar o gate rápido**

Run: `pnpm tsc --noEmit`
Expected: sem erros (confirma que nenhum outro arquivo importava a classe do lugar
antigo).

- [ ] **Step 4: Commit**

```bash
git add src/lib/errors.ts src/features/dunning/service.ts
git commit -m "refactor(errors): promote UnknownTemplateVariableError to lib (2nd feature needs it)"
```

---

### Task 3: `core/dates.ts` — janela de quiet hours

**Files:**
- Modify: `src/core/dates.ts`
- Modify: `src/core/dates.test.ts`

**Interfaces:**
- Produces: `isWithinLocalHourRange(instant: Date, startHour: number, endHour: number, timezone: string): boolean`.

- [ ] **Step 1: Escrever o teste (falho)**

Adicionar a `src/core/dates.test.ts`:

```ts
import { isWithinLocalHourRange } from './dates';

describe('isWithinLocalHourRange', () => {
  const TZ = 'America/Sao_Paulo';

  it('dentro da janela (10h local, janela 8-20)', () => {
    const instant = new Date('2026-08-08T13:00:00Z'); // 10h em America/Sao_Paulo (UTC-3)
    expect(isWithinLocalHourRange(instant, 8, 20, TZ)).toBe(true);
  });

  it('antes da janela (07h local, janela 8-20)', () => {
    const instant = new Date('2026-08-08T10:00:00Z'); // 07h local
    expect(isWithinLocalHourRange(instant, 8, 20, TZ)).toBe(false);
  });

  it('depois da janela (21h local, janela 8-20)', () => {
    const instant = new Date('2026-08-09T00:00:00Z'); // 21h local (dia anterior em UTC)
    expect(isWithinLocalHourRange(instant, 8, 20, TZ)).toBe(false);
  });

  it('na borda inicial (08h00 local, janela 8-20) conta como dentro', () => {
    const instant = new Date('2026-08-08T11:00:00Z'); // 08h local
    expect(isWithinLocalHourRange(instant, 8, 20, TZ)).toBe(true);
  });

  it('na borda final (19h59 local, janela 8-20) conta como dentro; 20h00 conta como fora', () => {
    const inside = new Date('2026-08-08T22:59:00Z'); // 19h59 local
    const outside = new Date('2026-08-08T23:00:00Z'); // 20h00 local
    expect(isWithinLocalHourRange(inside, 8, 20, TZ)).toBe(true);
    expect(isWithinLocalHourRange(outside, 8, 20, TZ)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/core/dates.test.ts`
Expected: FAIL — `isWithinLocalHourRange` não existe.

- [ ] **Step 3: Implementar**

```ts
// adicionar a src/core/dates.ts, perto de startOfLocalDay/endOfLocalDay
/** Verifica se o instante cai dentro de [startHour, endHour) no fuso local. */
export function isWithinLocalHourRange(instant: Date, startHour: number, endHour: number, timezone: string): boolean {
  const local = new TZDate(instant, timezone);
  const hour = local.getHours() + local.getMinutes() / 60;
  return hour >= startHour && hour < endHour;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/core/dates.test.ts`
Expected: PASS, todos os testes (novos e os já existentes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/core/dates.ts src/core/dates.test.ts
git commit -m "feat(core): add isWithinLocalHourRange for quiet-hours check"
```

---

### Task 4: `features/messaging/dispatch.ts`

**Files:**
- Create: `src/features/messaging/dispatch.ts`
- Test: `src/features/messaging/dispatch.integration.test.ts`

**Interfaces:**
- Consumes: `assertKnownVariables`/`renderTemplate`/`TemplateContext` de
  `@/core/dunning-template`, `isWithinLocalHourRange` de `@/core/dates` (Task 3),
  `resolveAdapter` de `./channels/registry`, `decrypt` de `@/lib/crypto`,
  `UnknownTemplateVariableError`/`DomainError` de `@/lib/errors` (Task 2),
  `getSettings` de `@/features/settings/queries`.
- Produces: `sendManualBatch(input: { customerIds: string[]; body: string; now: Date
  }): Promise<DispatchSummary>`, tipo `DispatchSummary = { sent: number; failed:
  number; skippedOptedOut: number; skippedNoPhone: number }`, erros
  `NoDefaultChannelError`, `OutsideQuietHoursError`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/messaging/dispatch.integration.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { sendManualBatch, NoDefaultChannelError, OutsideQuietHoursError } from './dispatch';
import { UnknownTemplateVariableError } from '@/lib/errors';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 9).toString('base64');

const IN_HOURS_NOW = new Date('2026-08-08T15:00:00Z'); // 12h em America/Sao_Paulo, dentro de 8-20
const OUT_OF_HOURS_NOW = new Date('2026-08-09T02:00:00Z'); // 23h local, fora de 8-20

async function seedActiveDefaultChannel() {
  await db.channelConfig.create({
    data: {
      provider: 'META_CLOUD',
      label: 'Meta Cloud API',
      isActive: true,
      isDefault: true,
      credentials: encrypt(JSON.stringify({ accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' }), 'channel.credentials'),
      lastCheckOk: true,
    },
  });
}

async function seedCustomer(overrides: Partial<{ phone: string | null; optedOut: boolean }> = {}) {
  return db.customer.create({
    data: { name: 'Cliente Teste', phone: overrides.phone ?? '+5511999990000', optedOut: overrides.optedOut ?? false },
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  await db.message.deleteMany({ where: { customer: { name: 'Cliente Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Cliente Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

describe('sendManualBatch', () => {
  it('rejeita variável desconhecida sem criar nenhuma Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.apelido}}', now: IN_HOURS_NOW }),
    ).rejects.toThrow(UnknownTemplateVariableError);

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it('rejeita sem canal padrão ativo, sem criar nenhuma Message', async () => {
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW }),
    ).rejects.toThrow(NoDefaultChannelError);
  });

  it('rejeita fora de quiet hours, sem criar nenhuma Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();

    await expect(
      sendManualBatch({ customerIds: [customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: OUT_OF_HOURS_NOW }),
    ).rejects.toThrow(OutsideQuietHoursError);

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(0);
  });

  it('cliente com optedOut nunca vira Message, aparece em skippedOptedOut', async () => {
    await seedActiveDefaultChannel();
    const optedOut = await seedCustomer({ optedOut: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'x' }] }) }));

    const summary = await sendManualBatch({ customerIds: [optedOut.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ sent: 0, failed: 0, skippedOptedOut: 1, skippedNoPhone: 0 });
    const count = await db.message.count({ where: { customerId: optedOut.id } });
    expect(count).toBe(0);
  });

  it('cliente sem telefone nunca vira Message, aparece em skippedNoPhone', async () => {
    await seedActiveDefaultChannel();
    const noPhone = await seedCustomer({ phone: null });

    const summary = await sendManualBatch({ customerIds: [noPhone.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary).toEqual({ sent: 0, failed: 0, skippedOptedOut: 0, skippedNoPhone: 1 });
  });

  it('dois clientes, um sucesso e um falha — falha não derruba o sucesso anterior', async () => {
    await seedActiveDefaultChannel();
    const ok = await seedCustomer();
    const bad = await db.customer.create({ data: { name: 'Cliente Teste', phone: '+5511999990001', optedOut: false } });

    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.resolve({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid1' }] }) });
      return Promise.resolve({ ok: false, status: 400, json: async () => ({ error: { message: 'rejeitado' } }) });
    }));

    const summary = await sendManualBatch({ customerIds: [ok.id, bad.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
    const messages = await db.message.findMany({ where: { customerId: { in: [ok.id, bad.id] } } });
    expect(messages).toHaveLength(2);
    expect(messages.find((m) => m.customerId === ok.id)?.status).toBe('SENT');
    expect(messages.find((m) => m.customerId === bad.id)?.status).toBe('FAILED');
  });

  it('mesmo customerId duas vezes na entrada gera uma única Message', async () => {
    await seedActiveDefaultChannel();
    const customer = await seedCustomer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ messages: [{ id: 'x' }] }) }));

    await sendManualBatch({ customerIds: [customer.id, customer.id], body: 'Olá {{cliente.primeiro_nome}}', now: IN_HOURS_NOW });

    const count = await db.message.count({ where: { customerId: customer.id } });
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/messaging/dispatch.integration.test.ts`
Expected: FAIL — `./dispatch` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/messaging/dispatch.ts
import { db } from '@/lib/db';
import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';
import { assertKnownVariables, renderTemplate, type TemplateContext } from '@/core/dunning-template';
import { isWithinLocalHourRange, localDateOnly } from '@/core/dates';
import { decrypt } from '@/lib/crypto';
import { resolveAdapter } from './channels/registry';
import { getSettings } from '@/features/settings/queries';

export class NoDefaultChannelError extends DomainError {
  constructor(cause?: unknown) {
    super('Configure um canal padrão em Canais antes de enviar.', 'NO_DEFAULT_CHANNEL', { cause });
  }
}

export class OutsideQuietHoursError extends DomainError {
  constructor(cause?: unknown) {
    super('Fora do horário permitido. Tente novamente dentro da janela configurada.', 'OUTSIDE_QUIET_HOURS', { cause });
  }
}

export interface DispatchSummary {
  sent: number;
  failed: number;
  skippedOptedOut: number;
  skippedNoPhone: number;
}

export async function sendManualBatch(input: { customerIds: string[]; body: string; now: Date }): Promise<DispatchSummary> {
  try {
    assertKnownVariables(input.body);
  } catch (err) {
    throw new UnknownTemplateVariableError(err instanceof Error ? err.message : 'Variável de template desconhecida.', err);
  }

  const channelRow = await db.channelConfig.findFirst({ where: { isDefault: true, isActive: true } });
  if (!channelRow) throw new NoDefaultChannelError();

  const settings = await getSettings();
  if (!isWithinLocalHourRange(input.now, settings.quietHourStart, settings.quietHourEnd, settings.timezone)) {
    throw new OutsideQuietHoursError();
  }

  const uniqueIds = [...new Set(input.customerIds)];
  const customers = await db.customer.findMany({ where: { id: { in: uniqueIds } } });

  const skippedOptedOut = customers.filter((c) => c.optedOut).length;
  const skippedNoPhone = customers.filter((c) => !c.optedOut && !c.phone).length;
  const eligible = customers.filter((c) => !c.optedOut && c.phone);

  const adapter = resolveAdapter(channelRow.provider);
  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));
  const scheduledDate = localDateOnly(input.now, settings.timezone);

  let sent = 0;
  let failed = 0;

  for (const customer of eligible) {
    const context: TemplateContext = {
      'cliente.primeiro_nome': customer.name.split(' ')[0],
      'cliente.nome': customer.name,
      'cobranca.valor': '',
      'cobranca.vencimento': '',
      'cobranca.dias_atraso': '',
      'pix.chave': settings.pixKey ?? '',
      'negocio.nome': settings.businessName,
    };
    const rendered = renderTemplate(input.body, context);
    const result = await adapter.send({ toPhone: customer.phone as string, body: rendered }, credentials);

    await db.message.create({
      data: {
        customerId: customer.id,
        channelId: channelRow.id,
        kind: 'MANUAL',
        status: result.ok ? 'SENT' : 'FAILED',
        toPhone: customer.phone as string,
        body: rendered,
        scheduledFor: input.now,
        scheduledDate,
        sentAt: result.ok ? input.now : null,
        externalId: result.ok ? result.externalId : null,
        failReason: result.ok ? null : result.reason,
        attempts: 1,
      },
    });

    if (result.ok) sent += 1;
    else failed += 1;
  }

  return { sent, failed, skippedOptedOut, skippedNoPhone };
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm test:integration -- src/features/messaging/dispatch.integration.test.ts`
Expected: PASS, todos os 7 testes.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/dispatch.ts src/features/messaging/dispatch.integration.test.ts
git commit -m "feat(messaging): add synchronous manual dispatch (T5/T6/dedupe, no queue)"
```

---

### Task 5: `sendManualMessagesSchema` + Server Action

**Files:**
- Modify: `src/features/messaging/schema.ts`
- Modify: `src/features/messaging/actions.ts`

**Interfaces:**
- Consumes: `sendManualBatch` (Task 4).
- Produces: `sendManualMessagesSchema` (Zod), `sendManualMessagesAction(input:
  unknown): Promise<{ ok: true; summary: DispatchSummary } | { error: { code:
  string; message: string } }>`.

- [ ] **Step 1: Adicionar a `schema.ts`**

```ts
export const sendManualMessagesSchema = z.object({
  customerIds: z.array(z.uuid()).min(1, 'Selecione ao menos um cliente.'),
  body: z.string().min(1, 'Escreva o texto da mensagem.'),
});

export type SendManualMessagesInput = z.infer<typeof sendManualMessagesSchema>;
```

- [ ] **Step 2: Adicionar a `actions.ts`**

```ts
export async function sendManualMessagesAction(input: unknown) {
  try {
    await requireSession();
    const parsed = sendManualMessagesSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    const summary = await sendManualBatch({ ...parsed.data, now: new Date() });
    revalidatePath('/customers');
    return { ok: true as const, summary };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.sendManual', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

Ajustar imports no topo do arquivo (`sendManualMessagesSchema` de `./schema`,
`sendManualBatch` de `./dispatch`) seguindo o padrão já usado pelas outras 4 actions
do arquivo.

- [ ] **Step 3: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/messaging/schema.ts src/features/messaging/actions.ts
git commit -m "feat(messaging): add sendManualMessagesAction"
```

---

### Task 6: `TypeToConfirmDialog`

**Files:**
- Create: `src/components/ui/type-to-confirm-dialog.tsx`
- Test: `src/components/ui/type-to-confirm-dialog.test.tsx`

**Interfaces:**
- Consumes: `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` de
  `./dialog`, `Button` de `./button`, `Input` de `./input`.
- Produces: `TypeToConfirmDialog({ open, onOpenChange, title, description, expectedValue, confirmLabel, onConfirm })` — igual a `ConfirmDialog`, mas o botão de confirmar só habilita quando o texto digitado bate com `String(expectedValue)`.

- [ ] **Step 1: Escrever o teste (falho)**

```tsx
// src/components/ui/type-to-confirm-dialog.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TypeToConfirmDialog } from './type-to-confirm-dialog';

describe('TypeToConfirmDialog', () => {
  it('botão de confirmar começa desabilitado e só habilita com o número exato', async () => {
    const onConfirm = vi.fn();
    render(
      <TypeToConfirmDialog
        open
        onOpenChange={() => {}}
        title="Enviar mensagens"
        description="Confirme digitando o número de destinatários."
        expectedValue={142}
        confirmLabel="Enviar"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Enviar' });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '14');
    expect(confirmButton).toBeDisabled();

    await userEvent.type(input, '2');
    expect(confirmButton).not.toBeDisabled();

    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/components/ui/type-to-confirm-dialog.test.tsx`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```tsx
// src/components/ui/type-to-confirm-dialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Button } from './button';
import { Input } from './input';

export function TypeToConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  expectedValue,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  expectedValue: number;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');
  const matches = typed.trim() === String(expectedValue);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] bg-surface">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-foreground-muted">{description}</p>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={String(expectedValue)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!matches} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Se `DialogFooter`/`DialogTitle`/etc. tiverem nomes ou props diferentes do assumido
aqui, ajustar pra bater com `src/components/ui/dialog.tsx` real — checar o arquivo
antes de fechar o import.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/components/ui/type-to-confirm-dialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/type-to-confirm-dialog.tsx src/components/ui/type-to-confirm-dialog.test.tsx
git commit -m "feat(ui): add TypeToConfirmDialog for batch actions above threshold"
```

---

### Task 7: `SendMessageButton` + `SendMessageDialog`

**Files:**
- Create: `src/features/messaging/components/send-message-button.tsx`
- Create: `src/features/messaging/components/send-message-dialog.tsx`

**Interfaces:**
- Consumes: `sendManualMessagesAction` (Task 5), `TypeToConfirmDialog` (Task 6),
  `Dialog`/`Button`/`toastError`/`toastSuccess` já estabelecidos no projeto.
- Produces: `SendMessageButton({ recipients: { id: string; name: string }[] })`,
  `SendMessageDialog({ open, onOpenChange, recipients })`.

- [ ] **Step 1: Implementar `send-message-dialog.tsx`**

```tsx
// src/features/messaging/components/send-message-dialog.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TypeToConfirmDialog } from '@/components/ui/type-to-confirm-dialog';
import { sendManualMessagesAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';

const BATCH_CONFIRM_THRESHOLD = 100;

export function SendMessageDialog({
  open,
  onOpenChange,
  recipients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: { id: string; name: string }[];
}) {
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function send() {
    setIsSending(true);
    const result = await sendManualMessagesAction({ customerIds: recipients.map((r) => r.id), body });
    setIsSending(false);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(`Enviado: ${result.summary.sent} · Falhou: ${result.summary.failed} · Opt-out: ${result.summary.skippedOptedOut} · Sem telefone: ${result.summary.skippedNoPhone}`);
    setBody('');
    setConfirmOpen(false);
    onOpenChange(false);
  }

  function handleConfirmClick() {
    if (recipients.length > BATCH_CONFIRM_THRESHOLD) {
      setConfirmOpen(true);
      return;
    }
    send();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem — {recipients.length} destinatário(s)</DialogTitle>
          </DialogHeader>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            placeholder="Olá {{cliente.primeiro_nome}}!"
            className="w-full rounded-sm border border-border bg-surface px-2 py-1.5 text-sm"
          />
          <ul className="mt-2 max-h-40 overflow-y-auto text-sm text-foreground-muted">
            {recipients.map((r) => (
              <li key={r.id}>{r.name}</li>
            ))}
          </ul>
          <Button disabled={isSending || !body.trim()} onClick={handleConfirmClick}>
            {recipients.length > BATCH_CONFIRM_THRESHOLD ? 'Continuar' : 'Enviar'}
          </Button>
        </DialogContent>
      </Dialog>
      <TypeToConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Confirmar envio em lote"
        description={`Você está prestes a enviar ${recipients.length} mensagens. Digite o número pra confirmar.`}
        expectedValue={recipients.length}
        confirmLabel="Enviar"
        onConfirm={send}
      />
    </>
  );
}
```

- [ ] **Step 2: Implementar `send-message-button.tsx`**

```tsx
// src/features/messaging/components/send-message-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SendMessageDialog } from './send-message-dialog';

export function SendMessageButton({ recipients }: { recipients: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);

  if (recipients.length === 0) return null;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Enviar mensagem ({recipients.length})
      </Button>
      <SendMessageDialog open={open} onOpenChange={setOpen} recipients={recipients} />
    </>
  );
}
```

- [ ] **Step 3: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros. Confirmar antes se `Button` aceita `variant="secondary"` (já
confirmado em tasks anteriores desta mesma stack de trabalho — deve seguir válido).

- [ ] **Step 4: Commit**

```bash
git add src/features/messaging/components/send-message-button.tsx src/features/messaging/components/send-message-dialog.tsx
git commit -m "feat(messaging): add SendMessageButton and SendMessageDialog"
```

---

### Task 8: Wire em `/charges`

**Files:**
- Modify: `src/app/(app)/charges/page.tsx`

**Interfaces:**
- Consumes: `SendMessageButton` (Task 7), `rows` já retornado por `listCharges` (tem
  `customerId`/`customerName`).

- [ ] **Step 1: Editar `page.tsx`**

Ler o arquivo atual primeiro (já existe, tem ~35 linhas por commits anteriores).
Adicionar, depois de resolver `rows`:

```ts
const uniqueRecipients = Array.from(
  new Map(rows.map((r) => [r.customerId, { id: r.customerId, name: r.customerName }])).values(),
);
```

E renderizar `<SendMessageButton recipients={uniqueRecipients} />` perto do
`ChargeFilters` (ex.: numa linha com `justify-between`, filtros de um lado, botão do
outro — ajustar ao layout real do arquivo).

- [ ] **Step 2: Rodar o gate completo**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: tudo limpo. Confirmar `page.tsx` continua ≤100 linhas.

- [ ] **Step 3: Commit**

```bash
git add src/app/'(app)'/charges/page.tsx
git commit -m "feat(charges): wire SendMessageButton into the charges list"
```

---

### Task 9: `listMessagesForCustomer` + `MessageTimeline`

**Files:**
- Create: `src/features/messaging/components/message-timeline.tsx`
- Modify: `src/features/messaging/queries.ts`
- Test: `src/features/messaging/queries.integration.test.ts` (arquivo já existe —
  adicionar, não substituir)

**Interfaces:**
- Produces: `MessageDTO`, `listMessagesForCustomer(customerId: string):
  Promise<MessageDTO[]>`, componente `MessageTimeline({ messages, timezone })`.

- [ ] **Step 1: Escrever o teste (falho)**

Adicionar a `src/features/messaging/queries.integration.test.ts`:

```ts
import { listMessagesForCustomer } from './queries';

describe('listMessagesForCustomer', () => {
  it('devolve as mensagens do cliente, mais recente primeiro', async () => {
    const customer = await db.customer.create({ data: { name: 'Timeline Teste', phone: '+5511999990002' } });
    await db.message.create({
      data: { customerId: customer.id, kind: 'MANUAL', status: 'SENT', toPhone: customer.phone!, body: 'Oi', scheduledFor: new Date(), scheduledDate: new Date(), sentAt: new Date() },
    });

    const rows = await listMessagesForCustomer(customer.id);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SENT');
    expect(rows[0].body).toBe('Oi');

    await db.message.deleteMany({ where: { customerId: customer.id } });
    await db.customer.delete({ where: { id: customer.id } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/messaging/queries.integration.test.ts`
Expected: FAIL — `listMessagesForCustomer` não existe.

- [ ] **Step 3: Implementar a query**

Adicionar a `src/features/messaging/queries.ts`:

```ts
export interface MessageDTO {
  id: string;
  kind: string;
  status: string;
  body: string;
  sentAt: string | null;
  failReason: string | null;
  createdAt: string;
}

export async function listMessagesForCustomer(customerId: string): Promise<MessageDTO[]> {
  const rows = await db.message.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    status: row.status,
    body: row.body,
    sentAt: row.sentAt?.toISOString() ?? null,
    failReason: row.failReason,
    createdAt: row.createdAt.toISOString(),
  }));
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Implementar `MessageTimeline`**

```tsx
// src/features/messaging/components/message-timeline.tsx
import { Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatLocalDate } from '@/lib/format';
import type { MessageDTO } from '../queries';

const STATUS_ICON: Record<string, string> = { SENT: '✓', FAILED: '✗', SKIPPED: '⊘', CANCELLED: '⊘', PENDING: '…' };

export function MessageTimeline({ messages, timezone }: { messages: MessageDTO[]; timezone: string }) {
  if (messages.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nenhuma mensagem enviada ainda"
        description="Mensagens manuais e da régua aparecem aqui."
      />
    );
  }

  return (
    <div className="space-y-2">
      {messages.map((msg) => (
        <div key={msg.id} className="rounded border border-border bg-surface p-3">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>{STATUS_ICON[msg.status] ?? '?'} {formatLocalDate(msg.createdAt, timezone)}</span>
            <span>{msg.kind}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-foreground">{msg.body}</p>
          {msg.failReason && <p className="mt-1 text-xs text-danger">{msg.failReason}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros. Confirmar se `EmptyState` aceita `icon`/`title`/`description`
como já usado em `charge-table.tsx`/`customer-charge-history.tsx`.

- [ ] **Step 7: Commit**

```bash
git add src/features/messaging/queries.ts src/features/messaging/queries.integration.test.ts src/features/messaging/components/message-timeline.tsx
git commit -m "feat(messaging): add listMessagesForCustomer and MessageTimeline"
```

---

### Task 10: Habilitar aba "Mensagens" + wire final + gate completo

**Files:**
- Modify: `src/features/customers/components/customer-tabs.tsx`
- Modify: `src/app/(app)/customers/[id]/page.tsx`

**Interfaces:**
- Consumes: `listMessagesForCustomer` (Task 9), `MessageTimeline` (Task 9).

- [ ] **Step 1: Habilitar a aba em `customer-tabs.tsx`**

Trocar a entrada `messages` de `disabled: true, title: 'Disponível na Etapa 3'` pra
`disabled: false, title: undefined` — mesma mudança já feita pra `charges` numa task
anterior desta stack de trabalho.

- [ ] **Step 2: Editar `page.tsx`**

Ler o arquivo atual (já tem lógica de `aba` pra `charges` vs `subscriptions`).
Estender pra 3 abas: adicionar `listMessagesForCustomer(id)` ao `Promise.all`
existente, e um branch `aba === 'messages'` renderizando `<MessageTimeline
messages={messages} timezone={settings.timezone} />` dentro de `CustomerTabs`, ao
lado dos branches já existentes de `subscriptions`/`charges`.

- [ ] **Step 3: Rodar o gate completo do projeto**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm test:integration`
Expected: tudo limpo. Confirmar `page.tsx` continua ≤100 linhas — se passar, split
por responsabilidade (extrair a lógica de resolver `aba` pra uma função auxiliar no
mesmo arquivo), nunca subir o limite.

- [ ] **Step 4: Grep de fronteira**

Run: `grep -rn "from '@/features/" src/features/messaging/ "src/app/(app)/charges/" "src/app/(app)/customers/"`

Expected: só `@/features/settings/queries`, `@/features/auth/service` e, dentro de
`app/`, imports de qualquer feature (permitido — `app/` importa de todas). Nenhum
import de `features/dunning` de dentro de `features/messaging`, nenhum import de
`features/messaging` de dentro de `features/charges` ou `features/customers`
(components dessas duas features não devem importar de `messaging` diretamente — só
`app/` compõe).

- [ ] **Step 5: Commit**

```bash
git add src/features/customers/components/customer-tabs.tsx src/app/'(app)'/customers/'[id]'/page.tsx
git commit -m "feat(customers): enable Mensagens tab with real timeline"
```

---

## Self-review (spec coverage)

| Item da spec | Task |
|---|---|
| `Message` model + T7 dedupe (não bloqueia MANUAL) | 1 |
| `UnknownTemplateVariableError` compartilhado (correção de fronteira) | 2 |
| Quiet hours síncrono (recusa, não reagenda) | 3, 4 |
| `sendManualBatch`: validação, canal padrão, opt-out, sem telefone, dedupe, sequencial, falha isolada | 4 |
| Server Action | 5 |
| Confirmação por digitação acima de 100 | 6, 7 |
| Botão + dialog de envio, prévia por destinatário | 7 |
| Wire em `/charges` | 8 |
| Timeline de mensagens | 9 |
| Aba "Mensagens" na ficha do cliente | 10 |

Fora de escopo, confirmado: webhook de resposta, opt-out automático por palavra-chave
(Spec 3c-2), `messages-dispatch`/fila real, `DunningExecution`, T7 pra `MANUAL`, T8
(Etapa 4) — nenhuma task aqui os toca.
