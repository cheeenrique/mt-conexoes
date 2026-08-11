# Etapa 3c-2 — Webhook de resposta + opt-out automático Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber resposta do cliente via webhook (Meta Cloud + Evolution), gravar na timeline, e marcar opt-out automático por palavra-chave (T5) — fecha a Etapa 3.

**Architecture:** `verifyWebhookSignature`/`parseInboundWebhook` viram parte do contrato `ChannelAdapter`. Route handlers ficam casca (verificam assinatura, parseiam, chamam `processInboundMessage`). `core/opt-out-keywords.ts` faz o match puro da palavra-chave.

**Tech Stack:** Next.js Route Handlers, Prisma/Postgres, Vitest, `node:crypto` (HMAC).

## Global Constraints

- `SALVY` precisa implementar os 2 métodos novos do `ChannelAdapter` pra não quebrar a interface — stub que sempre recusa/retorna `null`, comentado como fora de escopo.
- Falha de assinatura no webhook devolve 401 **sem corpo** — mesma regra dos endpoints de cron.
- Toda resposta recebida vira `Message` `kind: INBOUND, status: RECEIVED` — antes de checar palavra-chave, nunca depois (perder a mensagem da timeline por causa de erro no match de opt-out não é aceitável).
- Match de palavra-chave é **exato** (mensagem inteira, case-insensitive), nunca substring.
- Idempotente: cliente já opted-out mandando a palavra de novo não gera erro nem duplicidade além da própria `Message`.
- `core/opt-out-keywords.ts` puro — sem I/O, sem `new Date()`.
- Zero `if (provider === ...)` fora de `features/messaging/channels/`.
- Migration aditiva nos enums (`ALTER TYPE ... ADD VALUE`) — nunca remove/renomeia valor existente.
- Texto de UI e mensagens de erro em pt-BR.
- Spec fonte: `docs/superpowers/specs/2026-08-10-etapa-3c2-webhook-optout-design.md`.

---

### Task 1: Migration — `MessageKind.INBOUND` + `MessageStatus.RECEIVED`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000008_inbound_messages/migration.sql`

**Interfaces:**
- Produces: enum `MessageKind` ganha `INBOUND`; enum `MessageStatus` ganha `RECEIVED`.

- [ ] **Step 1: Editar `prisma/schema.prisma`**

Adicionar `INBOUND` ao final da lista de `enum MessageKind` e `RECEIVED` ao final de
`enum MessageStatus` (não reordenar os valores existentes — Postgres permite `ADD
VALUE` só no fim ou com `BEFORE`/`AFTER`, e reordenar por capricho não tem ganho).

- [ ] **Step 2: Gerar a migration**

Run: `pnpm prisma migrate dev --name inbound_messages --create-only`

Renomeie a pasta gerada para `00000000000008_inbound_messages`.

- [ ] **Step 3: Verificar o SQL gerado**

Deve conter só:
```sql
ALTER TYPE "MessageKind" ADD VALUE 'INBOUND';
ALTER TYPE "MessageStatus" ADD VALUE 'RECEIVED';
```
Sem `CREATE TYPE`/`DROP TYPE` (Prisma às vezes recria o enum inteiro dependendo da
versão — se isso acontecer, o diff geraria uma migration destrutiva. Se o Prisma
gerar `DROP TYPE`/`CREATE TYPE` em vez de `ADD VALUE`, edite o arquivo manualmente
pros dois `ALTER TYPE ... ADD VALUE` acima antes de aplicar — nunca dropar um enum
com dado existente.)

- [ ] **Step 4: Aplicar e gerar o client**

Run: `pnpm prisma migrate dev`
Run: `pnpm prisma generate`

Expected: `MessageKind.INBOUND` e `MessageStatus.RECEIVED` disponíveis no client.

- [ ] **Step 5: Confirmar no banco de verdade**

Via `psql`/`prisma db execute`: `SELECT enum_range(NULL::"MessageKind");` e
`SELECT enum_range(NULL::"MessageStatus");` — confirmar `INBOUND`/`RECEIVED`
presentes e todos os valores anteriores intactos.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add INBOUND message kind and RECEIVED status"
```

---

### Task 2: `ChannelAdapter` — 2 métodos novos + stub do Salvy

**Files:**
- Modify: `src/features/messaging/channels/types.ts`
- Modify: `src/features/messaging/channels/salvy/adapter.ts`
- Modify: `src/features/messaging/channels/meta-cloud/schema.ts`
- Modify: `src/features/messaging/channels/evolution/schema.ts`

**Interfaces:**
- Produces: `InboundMessage = { fromPhone: string; text: string }`; `ChannelAdapter`
  ganha `verifyWebhookSignature(rawBody: string, headers: Headers, credentials:
  unknown): boolean` e `parseInboundWebhook(rawBody: string): InboundMessage[] |
  null`. `metaCloudCredentialsSchema` ganha `appSecret`. `evolutionCredentialsSchema`
  ganha `webhookToken`.

- [ ] **Step 1: Editar `types.ts`**

```ts
export type InboundMessage = { fromPhone: string; text: string };

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(input: SendInput, credentials: unknown): Promise<SendResult>;
  healthCheck(credentials: unknown): Promise<HealthResult>;
  verifyWebhookSignature(rawBody: string, headers: Headers, credentials: unknown): boolean;
  parseInboundWebhook(rawBody: string): InboundMessage[] | null;
}
```

- [ ] **Step 2: Adicionar `appSecret` a `meta-cloud/schema.ts`**

```ts
export const metaCloudCredentialsSchema = z.object({
  accessToken: z.string().min(1, 'Informe o token de acesso.'),
  phoneNumberId: z.string().min(1, 'Informe o Phone Number ID.'),
  wabaId: z.string().min(1, 'Informe o WABA ID.'),
  appSecret: z.string().min(1, 'Informe o App Secret.'),
});
```

- [ ] **Step 3: Adicionar `webhookToken` a `evolution/schema.ts`**

```ts
export const evolutionCredentialsSchema = z.object({
  baseUrl: z.string().url('Informe a URL do servidor Evolution.'),
  apiKey: z.string().min(1, 'Informe a API key.'),
  instanceName: z.string().min(1, 'Informe o nome da instância.'),
  webhookToken: z.string().min(1, 'Informe o token do webhook.'),
});
```

- [ ] **Step 4: Stub no `salvy/adapter.ts`**

Adicionar ao objeto `salvyAdapter` exportado:

```ts
  // ⚠️ Webhook do Salvy fora de escopo desta spec — sempre recusa/ignora.
  verifyWebhookSignature: () => false,
  parseInboundWebhook: () => null,
```

- [ ] **Step 5: Rodar o gate rápido**

Run: `pnpm tsc --noEmit`
Expected: FALHA esperada em `meta-cloud/adapter.ts` e `evolution/adapter.ts` — eles
ainda não implementam os 2 métodos novos da interface. Isso é esperado nesta task;
Tasks 4 e 5 resolvem. Confirme que o **único** erro reportado é "missing properties
verifyWebhookSignature, parseInboundWebhook" nesses dois arquivos, nada mais.

- [ ] **Step 6: Commit**

```bash
git add src/features/messaging/channels/types.ts src/features/messaging/channels/salvy/adapter.ts src/features/messaging/channels/meta-cloud/schema.ts src/features/messaging/channels/evolution/schema.ts
git commit -m "feat(messaging): add verifyWebhookSignature/parseInboundWebhook to ChannelAdapter"
```

---

### Task 3: `core/opt-out-keywords.ts`

**Files:**
- Create: `src/core/opt-out-keywords.ts`
- Test: `src/core/opt-out-keywords.test.ts`

**Interfaces:**
- Produces: `OPT_OUT_KEYWORDS = ['PARE', 'SAIR', 'CANCELAR', 'DESCADASTRAR', 'STOP']`,
  `matchOptOutKeyword(text: string): string | null`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/core/opt-out-keywords.test.ts
import { describe, expect, it } from 'vitest';
import { matchOptOutKeyword } from './opt-out-keywords';

describe('matchOptOutKeyword', () => {
  it('reconhece cada palavra da whitelist, exata', () => {
    expect(matchOptOutKeyword('PARE')).toBe('PARE');
    expect(matchOptOutKeyword('SAIR')).toBe('SAIR');
    expect(matchOptOutKeyword('CANCELAR')).toBe('CANCELAR');
    expect(matchOptOutKeyword('DESCADASTRAR')).toBe('DESCADASTRAR');
    expect(matchOptOutKeyword('STOP')).toBe('STOP');
  });

  it('case-insensitive e com espaço nas bordas', () => {
    expect(matchOptOutKeyword('pare')).toBe('PARE');
    expect(matchOptOutKeyword('  Pare  ')).toBe('PARE');
    expect(matchOptOutKeyword('Sair')).toBe('SAIR');
  });

  it('não dispara em substring dentro de frase', () => {
    expect(matchOptOutKeyword('não quero mais pagar, pare com isso')).toBeNull();
    expect(matchOptOutKeyword('vou pararar de responder')).toBeNull();
  });

  it('texto sem nenhuma palavra-chave retorna null', () => {
    expect(matchOptOutKeyword('Oi, tudo bem?')).toBeNull();
    expect(matchOptOutKeyword('')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/core/opt-out-keywords.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar**

```ts
// src/core/opt-out-keywords.ts
export const OPT_OUT_KEYWORDS = ['PARE', 'SAIR', 'CANCELAR', 'DESCADASTRAR', 'STOP'] as const;

/** Match exato (mensagem inteira, normalizada) contra a whitelist — nunca substring. */
export function matchOptOutKeyword(text: string): string | null {
  const normalized = text.trim().toUpperCase();
  const match = OPT_OUT_KEYWORDS.find((keyword) => keyword === normalized);
  return match ?? null;
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/core/opt-out-keywords.test.ts`
Expected: PASS, todos os testes.

- [ ] **Step 5: Commit**

```bash
git add src/core/opt-out-keywords.ts src/core/opt-out-keywords.test.ts
git commit -m "feat(core): add exact-match opt-out keyword detection"
```

---

### Task 4: Adapter `META_CLOUD` — webhook

**Files:**
- Modify: `src/features/messaging/channels/meta-cloud/adapter.ts`
- Modify: `src/features/messaging/channels/meta-cloud/adapter.test.ts`

**Interfaces:**
- Consumes: `InboundMessage` de `../types` (Task 2).
- Produces: `verifyWebhookSignature`/`parseInboundWebhook` implementados no
  `metaCloudAdapter`.

- [ ] **Step 1: Escrever os testes (falhos)**

Adicionar a `meta-cloud/adapter.test.ts`:

```ts
import { createHmac } from 'node:crypto';

const WEBHOOK_CREDENTIALS = { ...CREDENTIALS, appSecret: 'segredo-teste' };

function signBody(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('metaCloudAdapter.verifyWebhookSignature', () => {
  it('aceita assinatura correta', () => {
    const body = '{"entry":[]}';
    const headers = new Headers({ 'x-hub-signature-256': signBody(body, 'segredo-teste') });
    expect(metaCloudAdapter.verifyWebhookSignature(body, headers, WEBHOOK_CREDENTIALS)).toBe(true);
  });

  it('rejeita assinatura errada', () => {
    const body = '{"entry":[]}';
    const headers = new Headers({ 'x-hub-signature-256': signBody(body, 'segredo-errado') });
    expect(metaCloudAdapter.verifyWebhookSignature(body, headers, WEBHOOK_CREDENTIALS)).toBe(false);
  });

  it('rejeita header ausente', () => {
    const headers = new Headers();
    expect(metaCloudAdapter.verifyWebhookSignature('{}', headers, WEBHOOK_CREDENTIALS)).toBe(false);
  });
});

describe('metaCloudAdapter.parseInboundWebhook', () => {
  it('extrai telefone e texto de um payload de mensagem', () => {
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: '5511999998888', text: { body: 'PARE' } }] } }] }],
    });
    expect(metaCloudAdapter.parseInboundWebhook(payload)).toEqual([{ fromPhone: '5511999998888', text: 'PARE' }]);
  });

  it('ignora payload de delivery receipt (statuses, sem messages)', () => {
    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.x', status: 'delivered' }] } }] }],
    });
    expect(metaCloudAdapter.parseInboundWebhook(payload)).toBeNull();
  });

  it('payload malformado (JSON inválido) retorna null, não lança', () => {
    expect(metaCloudAdapter.parseInboundWebhook('not json')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/meta-cloud/adapter.test.ts`
Expected: FAIL — métodos não existem.

- [ ] **Step 3: Implementar**

```ts
// adicionar a meta-cloud/adapter.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { InboundMessage } from '../types';

function verifyWebhookSignature(rawBody: string, headers: Headers, rawCredentials: unknown): boolean {
  const credentials = parseCredentials(rawCredentials);
  const header = headers.get('x-hub-signature-256');
  if (!header?.startsWith('sha256=')) return false;

  const expected = createHmac('sha256', credentials.appSecret).update(rawBody).digest('hex');
  const received = header.slice('sha256='.length);

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function parseInboundWebhook(rawBody: string): InboundMessage[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const entries = (payload as { entry?: unknown[] })?.entry ?? [];
  const messages: InboundMessage[] = [];
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes ?? [];
    for (const change of changes) {
      const value = (change as { value?: { messages?: unknown[] } })?.value;
      for (const msg of value?.messages ?? []) {
        const from = (msg as { from?: unknown })?.from;
        const body = (msg as { text?: { body?: unknown } })?.text?.body;
        if (typeof from === 'string' && typeof body === 'string') {
          messages.push({ fromPhone: from, text: body });
        }
      }
    }
  }
  return messages.length > 0 ? messages : null;
}
```

Adicionar `verifyWebhookSignature, parseInboundWebhook,` ao objeto `metaCloudAdapter`
exportado.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/features/messaging/channels/meta-cloud/adapter.test.ts`
Expected: PASS, todos os testes (os antigos + os novos).

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/channels/meta-cloud/adapter.ts src/features/messaging/channels/meta-cloud/adapter.test.ts
git commit -m "feat(messaging): add Meta Cloud webhook signature verification and parsing"
```

---

### Task 5: Adapter `EVOLUTION` — webhook

⚠️ Formato do payload de webhook do Evolution não confirmado contra doc oficial
nesta spec — busque a doc real (WebFetch/context7, se disponível) antes de
implementar; se não estiver acessível, mantenha o formato abaixo como best-effort,
documentado em comentário, mesma ressalva já usada no adapter de envio.

**Files:**
- Modify: `src/features/messaging/channels/evolution/adapter.ts`
- Modify: `src/features/messaging/channels/evolution/adapter.test.ts`

**Interfaces:**
- Consumes: `InboundMessage` de `../types` (Task 2).
- Produces: `verifyWebhookSignature`/`parseInboundWebhook` implementados no
  `evolutionAdapter`.

- [ ] **Step 1: Escrever os testes (falhos)**

```ts
const WEBHOOK_CREDENTIALS = { ...CREDENTIALS, webhookToken: 'token-teste' };

describe('evolutionAdapter.verifyWebhookSignature', () => {
  it('aceita quando o header apikey bate com webhookToken', () => {
    const headers = new Headers({ apikey: 'token-teste' });
    expect(evolutionAdapter.verifyWebhookSignature('{}', headers, WEBHOOK_CREDENTIALS)).toBe(true);
  });

  it('rejeita token errado ou ausente', () => {
    expect(evolutionAdapter.verifyWebhookSignature('{}', new Headers({ apikey: 'errado' }), WEBHOOK_CREDENTIALS)).toBe(false);
    expect(evolutionAdapter.verifyWebhookSignature('{}', new Headers(), WEBHOOK_CREDENTIALS)).toBe(false);
  });
});

describe('evolutionAdapter.parseInboundWebhook', () => {
  it('extrai telefone e texto de messages.upsert', () => {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false }, message: { conversation: 'PARE' } },
    });
    expect(evolutionAdapter.parseInboundWebhook(payload)).toEqual([{ fromPhone: '5511999998888', text: 'PARE' }]);
  });

  it('ignora mensagem eco (fromMe: true)', () => {
    const payload = JSON.stringify({
      event: 'messages.upsert',
      data: { key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true }, message: { conversation: 'oi' } },
    });
    expect(evolutionAdapter.parseInboundWebhook(payload)).toBeNull();
  });

  it('payload malformado retorna null, não lança', () => {
    expect(evolutionAdapter.parseInboundWebhook('not json')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/evolution/adapter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// adicionar a evolution/adapter.ts
import type { InboundMessage } from '../types';

function verifyWebhookSignature(rawBody: string, headers: Headers, rawCredentials: unknown): boolean {
  const credentials = parseCredentials(rawCredentials);
  const header = headers.get('apikey');
  return header === credentials.webhookToken;
}

function parseInboundWebhook(rawBody: string): InboundMessage[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const data = (payload as { data?: { key?: { remoteJid?: unknown; fromMe?: unknown }; message?: { conversation?: unknown } } })?.data;
  if (!data || data.key?.fromMe === true) return null;

  const remoteJid = data.key?.remoteJid;
  const conversation = data.message?.conversation;
  if (typeof remoteJid !== 'string' || typeof conversation !== 'string') return null;

  const fromPhone = remoteJid.split('@')[0];
  return [{ fromPhone, text: conversation }];
}
```

Adicionar `verifyWebhookSignature, parseInboundWebhook,` ao objeto `evolutionAdapter`
exportado.

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/features/messaging/channels/evolution/adapter.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/channels/evolution/adapter.ts src/features/messaging/channels/evolution/adapter.test.ts
git commit -m "feat(messaging): add Evolution webhook token verification and parsing (best-effort payload)"
```

---

### Task 6: `features/messaging/inbound.ts`

**Files:**
- Create: `src/features/messaging/inbound.ts`
- Test: `src/features/messaging/inbound.integration.test.ts`

**Interfaces:**
- Consumes: `matchOptOutKeyword` de `@/core/opt-out-keywords` (Task 3), `localDateOnly`
  de `@/core/dates`.
- Produces: `processInboundMessage(input: { channelId: string; fromPhone: string;
  text: string; now: Date }): Promise<void>`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/messaging/inbound.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { processInboundMessage } from './inbound';

const NOW = new Date('2026-08-10T15:00:00Z');

async function seedChannel() {
  return db.channelConfig.create({ data: { provider: 'META_CLOUD', label: 'Meta', credentials: 'x' } });
}

afterEach(async () => {
  await db.message.deleteMany({ where: { customer: { name: 'Inbound Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Inbound Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

describe('processInboundMessage', () => {
  it('mensagem sem palavra-chave: grava Message RECEIVED, não mexe em optedOut', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990010' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990010', text: 'Oi, tudo bem?', now: NOW });

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0].kind).toBe('INBOUND');
    expect(messages[0].status).toBe('RECEIVED');
    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(false);
  });

  it('mensagem "PARE" marca opt-out e grava a Message', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990011' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990011', text: '  pare  ', now: NOW });

    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(true);
    expect(refreshed.optedOutReason).toContain('PARE');
    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('substring de palavra-chave não dispara opt-out', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990012' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990012', text: 'não quero mais pagar, pare com isso', now: NOW });

    const refreshed = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(refreshed.optedOut).toBe(false);
  });

  it('cliente já opted-out mandando a palavra de novo não quebra nem duplica', async () => {
    const channel = await seedChannel();
    const customer = await db.customer.create({ data: { name: 'Inbound Teste', phone: '+5511999990013', optedOut: true, optedOutReason: 'Palavra-chave: SAIR' } });

    await processInboundMessage({ channelId: channel.id, fromPhone: '+5511999990013', text: 'SAIR', now: NOW });

    const messages = await db.message.findMany({ where: { customerId: customer.id } });
    expect(messages).toHaveLength(1);
  });

  it('telefone sem Customer correspondente: não grava Message, não lança', async () => {
    const channel = await seedChannel();
    await expect(
      processInboundMessage({ channelId: channel.id, fromPhone: '+5511999999999', text: 'Oi', now: NOW }),
    ).resolves.toBeUndefined();
    const messages = await db.message.findMany({ where: { toPhone: '+5511999999999' } });
    expect(messages).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/features/messaging/inbound.integration.test.ts`
Expected: FAIL — `./inbound` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/messaging/inbound.ts
import { db } from '@/lib/db';
import { matchOptOutKeyword } from '@/core/opt-out-keywords';
import { localDateOnly } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';

export async function processInboundMessage(input: {
  channelId: string;
  fromPhone: string;
  text: string;
  now: Date;
}): Promise<void> {
  const customer = await db.customer.findUnique({ where: { phone: input.fromPhone } });
  if (!customer) return;

  const settings = await getSettings();
  const scheduledDate = localDateOnly(input.now, settings.timezone);

  await db.message.create({
    data: {
      customerId: customer.id,
      channelId: input.channelId,
      kind: 'INBOUND',
      status: 'RECEIVED',
      toPhone: input.fromPhone,
      body: input.text,
      scheduledFor: input.now,
      scheduledDate,
    },
  });

  const matchedKeyword = matchOptOutKeyword(input.text);
  if (matchedKeyword && !customer.optedOut) {
    await db.customer.update({
      where: { id: customer.id },
      data: { optedOut: true, optedOutAt: input.now, optedOutReason: `Palavra-chave: ${matchedKeyword}` },
    });
  }
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS, todos os 5 cenários.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/inbound.ts src/features/messaging/inbound.integration.test.ts
git commit -m "feat(messaging): add processInboundMessage (timeline + T5 opt-out)"
```

---

### Task 7: Route handler Meta Cloud

**Files:**
- Create: `src/app/api/webhooks/meta-cloud/route.ts`
- Test: `src/app/api/webhooks/meta-cloud/route.integration.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `resolveAdapter` de `@/features/messaging/channels/registry`, `decrypt`
  de `@/lib/crypto`, `processInboundMessage` (Task 6), `requireEnv` de `@/lib/env`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/app/api/webhooks/meta-cloud/route.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { POST, GET } from './route';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 3).toString('base64');
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-token-teste';

const APP_SECRET = 'app-secret-teste';

afterEach(async () => {
  await db.customer.deleteMany({ where: { name: 'Webhook Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

async function seedChannel() {
  const credentials = encrypt(
    JSON.stringify({ accessToken: 'a', phoneNumberId: 'b', wabaId: 'c', appSecret: APP_SECRET }),
    'channel.credentials',
  );
  return db.channelConfig.create({ data: { provider: 'META_CLOUD', label: 'Meta', isActive: true, credentials } });
}

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

describe('POST /api/webhooks/meta-cloud', () => {
  it('assinatura inválida devolve 401 sem corpo', async () => {
    await seedChannel();
    const body = '{"entry":[]}';
    const req = new Request('http://localhost/api/webhooks/meta-cloud', {
      method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=errado' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });

  it('sem canal ativo devolve 404', async () => {
    const body = '{"entry":[]}';
    const req = new Request('http://localhost/api/webhooks/meta-cloud', { method: 'POST', body });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('mensagem válida processa e devolve 200', async () => {
    await seedChannel();
    await db.customer.create({ data: { name: 'Webhook Teste', phone: '5511999990020' } });
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '5511999990020', text: { body: 'Oi' } }] } }] }] });
    const req = new Request('http://localhost/api/webhooks/meta-cloud', {
      method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const messages = await db.message.findMany({ where: { customer: { name: 'Webhook Teste' } } });
    expect(messages).toHaveLength(1);
    await db.message.deleteMany({ where: { customer: { name: 'Webhook Teste' } } });
  });
});

describe('GET /api/webhooks/meta-cloud (handshake)', () => {
  it('responde o challenge com token correto', async () => {
    const url = 'http://localhost/api/webhooks/meta-cloud?hub.mode=subscribe&hub.verify_token=verify-token-teste&hub.challenge=abc123';
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('token errado devolve 403', async () => {
    const url = 'http://localhost/api/webhooks/meta-cloud?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123';
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/app/api/webhooks/meta-cloud/route.integration.test.ts`
Expected: FAIL — rota não existe.

- [ ] **Step 3: Implementar**

```ts
// src/app/api/webhooks/meta-cloud/route.ts
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { requireEnv } from '@/lib/env';
import { resolveAdapter } from '@/features/messaging/channels/registry';
import { processInboundMessage } from '@/features/messaging/inbound';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const channelRow = await db.channelConfig.findFirst({ where: { provider: 'META_CLOUD', isActive: true } });
  if (!channelRow) return new Response(null, { status: 404 });

  const adapter = resolveAdapter('META_CLOUD');
  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

  if (!adapter.verifyWebhookSignature(rawBody, req.headers, credentials)) {
    return new Response(null, { status: 401 });
  }

  const messages = adapter.parseInboundWebhook(rawBody);
  if (!messages) return Response.json({ ok: true });

  for (const msg of messages) {
    try {
      await processInboundMessage({ channelId: channelRow.id, fromPhone: msg.fromPhone, text: msg.text, now: new Date() });
    } catch (err) {
      logger.error({ route: 'webhooks.meta-cloud', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    }
  }
  return Response.json({ ok: true });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get('hub.verify_token') !== requireEnv('META_WEBHOOK_VERIFY_TOKEN')) {
    return new Response(null, { status: 403 });
  }
  return new Response(url.searchParams.get('hub.challenge'));
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Adicionar variável de ambiente**

Em `.env.example`, adicionar:
```
META_WEBHOOK_VERIFY_TOKEN="dev-meta-webhook-verify-token"   # handshake de verificação do webhook Meta Cloud
```

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/meta-cloud/route.ts src/app/api/webhooks/meta-cloud/route.integration.test.ts .env.example
git commit -m "feat(webhooks): add Meta Cloud inbound webhook route"
```

---

### Task 8: Route handler Evolution

**Files:**
- Create: `src/app/api/webhooks/evolution/route.ts`
- Test: `src/app/api/webhooks/evolution/route.integration.test.ts`

**Interfaces:**
- Consumes: mesmas de Task 7, sem o handshake `GET` (Evolution não tem esse
  handshake — só `POST`).

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/app/api/webhooks/evolution/route.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { POST } from './route';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 3).toString('base64');
const WEBHOOK_TOKEN = 'evo-webhook-token-teste';

afterEach(async () => {
  await db.customer.deleteMany({ where: { name: 'Webhook Evo Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
});

async function seedChannel() {
  const credentials = encrypt(
    JSON.stringify({ baseUrl: 'https://evo.example.com', apiKey: 'k', instanceName: 'i', webhookToken: WEBHOOK_TOKEN }),
    'channel.credentials',
  );
  return db.channelConfig.create({ data: { provider: 'EVOLUTION', label: 'Evo', isActive: true, credentials } });
}

describe('POST /api/webhooks/evolution', () => {
  it('token inválido devolve 401 sem corpo', async () => {
    await seedChannel();
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body: '{}', headers: { apikey: 'errado' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });

  it('mensagem válida processa e devolve 200', async () => {
    await seedChannel();
    await db.customer.create({ data: { name: 'Webhook Evo Teste', phone: '5511999990030' } });
    const body = JSON.stringify({ data: { key: { remoteJid: '5511999990030@s.whatsapp.net', fromMe: false }, message: { conversation: 'Oi' } } });
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body, headers: { apikey: WEBHOOK_TOKEN },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const messages = await db.message.findMany({ where: { customer: { name: 'Webhook Evo Teste' } } });
    expect(messages).toHaveLength(1);
    await db.message.deleteMany({ where: { customer: { name: 'Webhook Evo Teste' } } });
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm test:integration -- src/app/api/webhooks/evolution/route.integration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/app/api/webhooks/evolution/route.ts
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { resolveAdapter } from '@/features/messaging/channels/registry';
import { processInboundMessage } from '@/features/messaging/inbound';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const channelRow = await db.channelConfig.findFirst({ where: { provider: 'EVOLUTION', isActive: true } });
  if (!channelRow) return new Response(null, { status: 404 });

  const adapter = resolveAdapter('EVOLUTION');
  const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

  if (!adapter.verifyWebhookSignature(rawBody, req.headers, credentials)) {
    return new Response(null, { status: 401 });
  }

  const messages = adapter.parseInboundWebhook(rawBody);
  if (!messages) return Response.json({ ok: true });

  for (const msg of messages) {
    try {
      await processInboundMessage({ channelId: channelRow.id, fromPhone: msg.fromPhone, text: msg.text, now: new Date() });
    } catch (err) {
      logger.error({ route: 'webhooks.evolution', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    }
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/evolution/route.ts src/app/api/webhooks/evolution/route.integration.test.ts
git commit -m "feat(webhooks): add Evolution inbound webhook route"
```

---

### Task 9: Fechar a spec — gate completo + boundary

**Files:**
- Nenhum arquivo novo — task de verificação final.

- [ ] **Step 1: Rodar o gate completo do projeto**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test && pnpm test:integration`
Expected: tudo limpo, sem warning novo.

- [ ] **Step 2: Grep de fronteira do adapter**

Run: `grep -rn "META_CLOUD\|EVOLUTION\|SALVY" src/app/api/webhooks/ src/features/messaging/inbound.ts src/core/`

Expected: nenhuma ocorrência — os route handlers usam `resolveAdapter` genérico, o
`inbound.ts` e o `core/` não sabem qual provider é.

- [ ] **Step 3: Confirmar `MessageDTO`/timeline mostram INBOUND corretamente**

Abrir manualmente (ou revisar o código de) `src/features/messaging/components/message-timeline.tsx`
(já existe, da Spec 3c-1) — confirmar que `kind: 'INBOUND'` e `status: 'RECEIVED'`
não quebram a renderização (o `STATUS_ICON` map tem fallback `'?'`, então não
crasha, mas confirme visualmente ou por leitura de código que faz sentido — se
achar que vale um ícone dedicado pra `RECEIVED` e um label pt-BR pra `INBOUND`, é
uma melhoria de UI pequena e pode ser feita aqui mesmo, dentro do orçamento de
tamanho do componente).

- [ ] **Step 4: Commit final (se o Step 3 gerou mudança)**

```bash
git add -A
git commit -m "polish(messaging): show INBOUND kind and RECEIVED status labels in timeline"
```

Se nada mudou no Step 3, pular o commit.

---

## Self-review (spec coverage)

| Item da spec | Task |
|---|---|
| Migration `MessageKind.INBOUND` + `MessageStatus.RECEIVED` | 1 |
| `verifyWebhookSignature`/`parseInboundWebhook` na interface + stub Salvy | 2 |
| `matchOptOutKeyword` puro, match exato | 3 |
| Adapter Meta Cloud — HMAC + parse | 4 |
| Adapter Evolution — token + parse (best-effort, doc pendente) | 5 |
| `processInboundMessage` — timeline sempre, opt-out condicional, idempotente | 6 |
| Route handler Meta Cloud (POST + GET handshake) | 7 |
| Route handler Evolution (POST) | 8 |
| Gate final + fronteira + timeline UI | 9 |

Fora de escopo, confirmado: webhook Salvy, `dunning-evaluate`/`messages-dispatch`
(Etapa 4), qualquer resposta automática ao cliente — nenhuma task aqui os toca.
