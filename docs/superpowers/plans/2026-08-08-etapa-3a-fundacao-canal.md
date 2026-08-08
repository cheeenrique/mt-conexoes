# Etapa 3a — Fundação de canal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a fundação de canal WhatsApp — interface `ChannelAdapter`, os 3 adapters (Meta Cloud, Evolution, Salvy), o modelo `ChannelConfig` e a tela `/channels` — sem enviar nenhuma mensagem real ainda.

**Architecture:** Registry resolve `ChannelAdapter` por `ChannelConfig.provider`; cada adapter mora isolado em `features/messaging/channels/<provider>/` com seu próprio schema de credencial e teste contra `fetch` mockado. `features/messaging/service.ts` orquestra: valida forma, cripta (`lib/crypto.ts`, já existe), decripta antes de chamar `adapter.healthCheck()`. UI client-only (`ChannelGrid`) recebe os 3 DTOs por prop e dispara Server Actions finas.

**Tech Stack:** Next.js App Router, Prisma/Postgres, Zod, react-hook-form, Vitest (unit com `fetch` mockado + integration contra Postgres real).

## Global Constraints

- Dinheiro/BigInt: não se aplica nesta spec (sem valores monetários).
- `credentials` nunca volta pro componente cliente, nem mascarado — DTO não tem o campo.
- Zero `if (provider === 'evolution')` fora de `features/messaging/channels/`.
- `core/` não é tocado nesta spec (sem cálculo puro novo).
- Toda entrada de Server Action passa por Zod; nenhum `z.any()`/`.passthrough()`.
- Migration aplicada é imutável; SQL manual pro índice único parcial de `is_default`.
- `page.tsx` ≤100 linhas; Server Action ≤30 linhas; `service.ts` ≤250 linhas.
- Texto de UI e mensagens de erro em pt-BR; código e identificadores em inglês.
- Spec fonte: `docs/superpowers/specs/2026-08-08-etapa-3a-fundacao-canal-design.md`.

---

### Task 1: Migration — `ChannelConfig` + `ChannelProvider`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/00000000000005_channel_config/migration.sql`

**Interfaces:**
- Produces: modelo Prisma `ChannelConfig` com campos `id, provider (ChannelProvider), label, isActive, isDefault, phoneNumber, credentials, riskAcceptedAt, lastCheckAt, lastCheckOk, lastError, createdAt, updatedAt`. Enum `ChannelProvider = META_CLOUD | EVOLUTION | SALVY`.

- [ ] **Step 1: Editar `prisma/schema.prisma`**

Adicionar ao final do arquivo:

```prisma
enum ChannelProvider {
  META_CLOUD
  EVOLUTION
  SALVY
}

model ChannelConfig {
  id             String          @id @default(uuid(7))
  provider       ChannelProvider @unique
  label          String
  isActive       Boolean         @default(false)
  isDefault      Boolean         @default(false)
  phoneNumber    String?
  credentials    String
  riskAcceptedAt DateTime?
  lastCheckAt    DateTime?
  lastCheckOk    Boolean?
  lastError      String?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  @@map("channel_configs")
}
```

- [ ] **Step 2: Gerar a migration**

Run: `pnpm prisma migrate dev --name channel_config --create-only`

Isso cria a pasta `prisma/migrations/<timestamp>_channel_config/migration.sql` com o `CREATE TABLE`/`CREATE TYPE` gerados pelo Prisma. Renomeie a pasta gerada para `00000000000005_channel_config` (mesmo padrão numérico das 4 anteriores).

- [ ] **Step 3: Acrescentar o SQL manual no fim do arquivo gerado**

```sql
-- No máximo um canal padrão
CREATE UNIQUE INDEX channel_configs_single_default ON channel_configs (is_default)
  WHERE is_default = true;
```

- [ ] **Step 4: Aplicar no banco de dev e gerar o client**

Run: `pnpm prisma migrate dev`
Run: `pnpm prisma generate`

Expected: migration aplicada sem erro, `@prisma/client` reflete `db.channelConfig` e `ChannelProvider`.

- [ ] **Step 5: Confirmar a constraint no banco de verdade**

Run (via `psql` ou `prisma db execute`):
```sql
INSERT INTO channel_configs (id, provider, label, is_active, is_default, credentials, created_at, updated_at)
VALUES ('t1', 'META_CLOUD', 'Meta', true, true, 'x', now(), now());
INSERT INTO channel_configs (id, provider, label, is_active, is_default, credentials, created_at, updated_at)
VALUES ('t2', 'EVOLUTION', 'Evolution', true, true, 'x', now(), now());
```
Expected: a segunda `INSERT` falha com violação de índice único (`channel_configs_single_default`). Depois, limpar: `DELETE FROM channel_configs WHERE id IN ('t1','t2');`

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add ChannelConfig model with single-default constraint"
```

---

### Task 2: Interface + capabilities + registry

**Files:**
- Create: `src/features/messaging/channels/types.ts`
- Create: `src/features/messaging/channels/registry.ts`
- Test: `src/features/messaging/channels/registry.test.ts`

**Interfaces:**
- Produces: tipos `ChannelCapabilities`, `SendInput`, `SendResult`, `HealthResult`, interface `ChannelAdapter` (`provider`, `capabilities`, `send(input, credentials)`, `healthCheck(credentials)`); função `resolveAdapter(provider: ChannelProvider): ChannelAdapter`.

- [ ] **Step 1: Criar `types.ts`**

```ts
// src/features/messaging/channels/types.ts
import type { ChannelProvider } from '@prisma/client';

export type ChannelCapabilities = {
  supportsFreeText: boolean;
  requiresApprovedTemplate: boolean;
  supportsInboundReply: boolean;
  supportsDeliveryReceipt: boolean;
  maxBodyLength: number;
  rateLimitPerMinute: number;
};

export type SendInput = {
  toPhone: string;
  body: string;
  templateRef?: { name: string; params?: Record<string, string> };
};

export type SendResult =
  | { ok: true; externalId: string }
  | { ok: false; retryable: boolean; reason: string };

export type HealthResult = { ok: true } | { ok: false; reason: string };

export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;
  send(input: SendInput, credentials: unknown): Promise<SendResult>;
  healthCheck(credentials: unknown): Promise<HealthResult>;
}
```

Nenhum teste dedicado para este arquivo — são só tipos, sem comportamento em runtime.

- [ ] **Step 2: Escrever o teste do registry (falho)**

```ts
// src/features/messaging/channels/registry.test.ts
import { describe, expect, it } from 'vitest';
import { resolveAdapter } from './registry';

describe('resolveAdapter', () => {
  it('resolve o adapter certo pra cada provider', () => {
    expect(resolveAdapter('META_CLOUD').provider).toBe('META_CLOUD');
    expect(resolveAdapter('EVOLUTION').provider).toBe('EVOLUTION');
    expect(resolveAdapter('SALVY').provider).toBe('SALVY');
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/registry.test.ts`
Expected: FAIL — `./registry` não existe ainda (adapters das Tasks 3–5 também não existem).

> Este teste só fecha (passa) depois das Tasks 3, 4 e 5 existirem. Escreva-o agora, deixe falhar, e volte a rodá-lo no fim da Task 5.

- [ ] **Step 4: Criar `registry.ts` com placeholders temporários**

Não é permitido placeholder de lógica — mas o registry pode importar os 3 adapters reais assim que eles existirem. Por ora, deixe este arquivo criado nesta Task listando as importações que as Tasks 3–5 vão satisfazer, e rode o teste de novo somente ao final da Task 5 (ver Step 3 acima). Conteúdo final (implementado já, sem placeholder — os módulos importados é que ainda não existem até a Task 5 terminar):

```ts
// src/features/messaging/channels/registry.ts
import type { ChannelProvider } from '@prisma/client';
import type { ChannelAdapter } from './types';
import { metaCloudAdapter } from './meta-cloud/adapter';
import { evolutionAdapter } from './evolution/adapter';
import { salvyAdapter } from './salvy/adapter';

const ADAPTERS: Record<ChannelProvider, ChannelAdapter> = {
  META_CLOUD: metaCloudAdapter,
  EVOLUTION: evolutionAdapter,
  SALVY: salvyAdapter,
};

export function resolveAdapter(provider: ChannelProvider): ChannelAdapter {
  return ADAPTERS[provider];
}
```

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/channels/types.ts src/features/messaging/channels/registry.ts src/features/messaging/channels/registry.test.ts
git commit -m "feat(messaging): add ChannelAdapter interface and registry skeleton"
```

---

### Task 3: Adapter `META_CLOUD`

**Files:**
- Create: `src/features/messaging/channels/meta-cloud/schema.ts`
- Create: `src/features/messaging/channels/meta-cloud/adapter.ts`
- Test: `src/features/messaging/channels/meta-cloud/adapter.test.ts`

**Interfaces:**
- Consumes: `ChannelAdapter`, `SendInput`, `SendResult`, `HealthResult` de `../types`.
- Produces: `metaCloudCredentialsSchema` (Zod), `metaCloudAdapter: ChannelAdapter`.

- [ ] **Step 1: Escrever `schema.ts`**

```ts
// src/features/messaging/channels/meta-cloud/schema.ts
import { z } from 'zod';

export const metaCloudCredentialsSchema = z.object({
  accessToken: z.string().min(1, 'Informe o token de acesso.'),
  phoneNumberId: z.string().min(1, 'Informe o Phone Number ID.'),
  wabaId: z.string().min(1, 'Informe o WABA ID.'),
});

export type MetaCloudCredentials = z.infer<typeof metaCloudCredentialsSchema>;
```

- [ ] **Step 2: Escrever o teste do adapter (falho)**

```ts
// src/features/messaging/channels/meta-cloud/adapter.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { metaCloudAdapter } from './adapter';

const CREDENTIALS = { accessToken: 'tok', phoneNumberId: '123', wabaId: '456' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('metaCloudAdapter.send', () => {
  it('envia template e devolve o externalId em caso de sucesso', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.123' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'renovacao_hoje', params: { '1': 'João' } } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: true, externalId: 'wamid.123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('123/messages');
    expect(init.headers.Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body);
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('renovacao_hoje');
  });

  it('marca retryable=true em erro de rate limit (HTTP 429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'rate limited', code: 80007 } }),
    }));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: true, reason: 'rate limited' });
  });

  it('marca retryable=false em template rejeitado (HTTP 400)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'template não aprovado', code: 132001 } }),
    }));

    const result = await metaCloudAdapter.send(
      { toPhone: '+5511999998888', body: '', templateRef: { name: 'x' } },
      CREDENTIALS,
    );

    expect(result).toEqual({ ok: false, retryable: false, reason: 'template não aprovado' });
  });

  it('rejeita credencial com forma inválida', async () => {
    await expect(
      metaCloudAdapter.send({ toPhone: '+5511999998888', body: '' }, { accessToken: '' }),
    ).rejects.toThrow();
  });
});

describe('metaCloudAdapter.healthCheck', () => {
  it('ok quando o phone number id responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: '123' }) }));
    expect(await metaCloudAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando o token é inválido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid OAuth access token' } }),
    }));
    expect(await metaCloudAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'Invalid OAuth access token' });
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/meta-cloud/adapter.test.ts`
Expected: FAIL — `./adapter` não existe.

- [ ] **Step 4: Implementar `adapter.ts`**

```ts
// src/features/messaging/channels/meta-cloud/adapter.ts
import type { ChannelAdapter, HealthResult, SendInput, SendResult } from '../types';
import { metaCloudCredentialsSchema, type MetaCloudCredentials } from './schema';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const RATE_LIMIT_CODES = new Set([4, 80007, 130429]);

function isRetryable(status: number, errorCode?: number): boolean {
  if (status >= 500) return true;
  if (errorCode !== undefined && RATE_LIMIT_CODES.has(errorCode)) return true;
  return false;
}

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials: MetaCloudCredentials = metaCloudCredentialsSchema.parse(rawCredentials);
  if (!input.templateRef) {
    return { ok: false, retryable: false, reason: 'Passo sem template aprovado para o canal Meta Cloud.' };
  }

  const response = await fetch(`${GRAPH_BASE}/${credentials.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: input.toPhone,
      type: 'template',
      template: {
        name: input.templateRef.name,
        language: { code: 'pt_BR' },
        components: input.templateRef.params
          ? [{ type: 'body', parameters: Object.values(input.templateRef.params).map((text) => ({ type: 'text', text })) }]
          : [],
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return { ok: false, retryable: isRetryable(response.status, payload.error?.code), reason: payload.error?.message ?? 'Falha desconhecida na Meta Cloud API.' };
  }
  return { ok: true, externalId: payload.messages[0].id };
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials: MetaCloudCredentials = metaCloudCredentialsSchema.parse(rawCredentials);
  const response = await fetch(`${GRAPH_BASE}/${credentials.phoneNumberId}?fields=id`, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
  });
  if (response.ok) return { ok: true };
  const payload = await response.json();
  return { ok: false, reason: payload.error?.message ?? 'Falha ao validar credencial da Meta Cloud API.' };
}

export const metaCloudAdapter: ChannelAdapter = {
  provider: 'META_CLOUD',
  capabilities: {
    supportsFreeText: false,
    requiresApprovedTemplate: true,
    supportsInboundReply: true,
    supportsDeliveryReceipt: true,
    maxBodyLength: 1024,
    rateLimitPerMinute: 80,
  },
  send,
  healthCheck,
};
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/features/messaging/channels/meta-cloud/adapter.test.ts`
Expected: PASS, todos os testes.

- [ ] **Step 6: Commit**

```bash
git add src/features/messaging/channels/meta-cloud
git commit -m "feat(messaging): add Meta Cloud API adapter"
```

---

### Task 4: Adapter `EVOLUTION`

**Files:**
- Create: `src/features/messaging/channels/evolution/schema.ts`
- Create: `src/features/messaging/channels/evolution/adapter.ts`
- Test: `src/features/messaging/channels/evolution/adapter.test.ts`

**Interfaces:**
- Consumes: `ChannelAdapter`, `SendInput`, `SendResult`, `HealthResult` de `../types`.
- Produces: `evolutionCredentialsSchema` (Zod), `evolutionAdapter: ChannelAdapter`.

- [ ] **Step 1: Escrever `schema.ts`**

```ts
// src/features/messaging/channels/evolution/schema.ts
import { z } from 'zod';

export const evolutionCredentialsSchema = z.object({
  baseUrl: z.string().url('Informe a URL do servidor Evolution.'),
  apiKey: z.string().min(1, 'Informe a API key.'),
  instanceName: z.string().min(1, 'Informe o nome da instância.'),
});

export type EvolutionCredentials = z.infer<typeof evolutionCredentialsSchema>;
```

- [ ] **Step 2: Escrever o teste do adapter (falho)**

```ts
// src/features/messaging/channels/evolution/adapter.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evolutionAdapter } from './adapter';

const CREDENTIALS = { baseUrl: 'https://evo.cliente.com', apiKey: 'key', instanceName: 'principal' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('evolutionAdapter.send', () => {
  it('envia texto livre e devolve o externalId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ key: { id: 'EVO123' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: true, externalId: 'EVO123' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://evo.cliente.com/message/sendText/principal');
    expect(init.headers.apikey).toBe('key');
    expect(JSON.parse(init.body)).toEqual({ number: '+5511999998888', text: 'Olá!' });
  });

  it('marca retryable=true quando o fetch rejeita (rede instável)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const result = await evolutionAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: true, reason: 'fetch failed' });
  });

  it('marca retryable=false em número inválido (HTTP 400)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'número inválido' }),
    }));

    const result = await evolutionAdapter.send({ toPhone: 'x', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: false, retryable: false, reason: 'número inválido' });
  });
});

describe('evolutionAdapter.healthCheck', () => {
  it('ok só quando a instância está com state "open"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ instance: { state: 'open' } }) }));
    expect(await evolutionAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando a instância está desconectada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ instance: { state: 'close' } }) }));
    expect(await evolutionAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'Instância Evolution desconectada (state: close).' });
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/evolution/adapter.test.ts`
Expected: FAIL — `./adapter` não existe.

- [ ] **Step 4: Implementar `adapter.ts`**

```ts
// src/features/messaging/channels/evolution/adapter.ts
import type { ChannelAdapter, HealthResult, SendInput, SendResult } from '../types';
import { evolutionCredentialsSchema, type EvolutionCredentials } from './schema';

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials: EvolutionCredentials = evolutionCredentialsSchema.parse(rawCredentials);
  try {
    const response = await fetch(`${credentials.baseUrl}/message/sendText/${credentials.instanceName}`, {
      method: 'POST',
      headers: { apikey: credentials.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: input.toPhone, text: input.body }),
    });
    const payload = await response.json();
    if (!response.ok) {
      return { ok: false, retryable: response.status >= 500, reason: payload.message ?? 'Falha desconhecida no Evolution.' };
    }
    return { ok: true, externalId: payload.key.id };
  } catch (err) {
    return { ok: false, retryable: true, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com o Evolution.' };
  }
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials: EvolutionCredentials = evolutionCredentialsSchema.parse(rawCredentials);
  const response = await fetch(`${credentials.baseUrl}/instance/connectionState/${credentials.instanceName}`, {
    headers: { apikey: credentials.apiKey },
  });
  if (!response.ok) return { ok: false, reason: 'Não foi possível falar com o servidor Evolution.' };
  const payload = await response.json();
  const state = payload.instance?.state;
  if (state === 'open') return { ok: true };
  return { ok: false, reason: `Instância Evolution desconectada (state: ${state}).` };
}

export const evolutionAdapter: ChannelAdapter = {
  provider: 'EVOLUTION',
  capabilities: {
    supportsFreeText: true,
    requiresApprovedTemplate: false,
    supportsInboundReply: true,
    supportsDeliveryReceipt: true,
    maxBodyLength: 4096,
    rateLimitPerMinute: 20,
  },
  send,
  healthCheck,
};
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/features/messaging/channels/evolution/adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/messaging/channels/evolution
git commit -m "feat(messaging): add Evolution API adapter"
```

---

### Task 5: Adapter `SALVY`

⚠️ A forma exata da API Salvy não está confirmada — antes de codar, busque a documentação oficial atual do provider (WebFetch/context7, se disponível) e ajuste o endpoint/payload abaixo antes de implementar. O que segue é o contrato mínimo esperado; **não commit sem confirmar contra a doc real** (ou, se a doc não estiver acessível, deixe registrado no corpo do commit que o payload é best-effort e precisa validação contra credencial real antes de produção).

**Files:**
- Create: `src/features/messaging/channels/salvy/schema.ts`
- Create: `src/features/messaging/channels/salvy/adapter.ts`
- Test: `src/features/messaging/channels/salvy/adapter.test.ts`

**Interfaces:**
- Consumes: `ChannelAdapter`, `SendInput`, `SendResult`, `HealthResult` de `../types`.
- Produces: `salvyCredentialsSchema` (Zod), `salvyAdapter: ChannelAdapter`.

- [ ] **Step 1: Escrever `schema.ts`**

```ts
// src/features/messaging/channels/salvy/schema.ts
import { z } from 'zod';

export const salvyCredentialsSchema = z.object({
  apiKey: z.string().min(1, 'Informe a API key.'),
});

export type SalvyCredentials = z.infer<typeof salvyCredentialsSchema>;
```

- [ ] **Step 2: Escrever o teste do adapter (falho)**

```ts
// src/features/messaging/channels/salvy/adapter.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { salvyAdapter } from './adapter';

const CREDENTIALS = { apiKey: 'salvy-key' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('salvyAdapter.send', () => {
  it('envia texto livre e devolve o externalId', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'SALVY-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);

    expect(result).toEqual({ ok: true, externalId: 'SALVY-1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer salvy-key');
  });

  it('marca retryable=true em erro 5xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: 'indisponível' }) }));
    const result = await salvyAdapter.send({ toPhone: '+5511999998888', body: 'Olá!' }, CREDENTIALS);
    expect(result).toEqual({ ok: false, retryable: true, reason: 'indisponível' });
  });

  it('marca retryable=false em erro 4xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ message: 'número inválido' }) }));
    const result = await salvyAdapter.send({ toPhone: 'x', body: 'Olá!' }, CREDENTIALS);
    expect(result).toEqual({ ok: false, retryable: false, reason: 'número inválido' });
  });
});

describe('salvyAdapter.healthCheck', () => {
  it('ok quando a api key é válida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    expect(await salvyAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: true });
  });

  it('falha quando a api key é inválida', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'chave inválida' }) }));
    expect(await salvyAdapter.healthCheck(CREDENTIALS)).toEqual({ ok: false, reason: 'chave inválida' });
  });
});
```

- [ ] **Step 3: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/channels/salvy/adapter.test.ts`
Expected: FAIL — `./adapter` não existe.

- [ ] **Step 4: Implementar `adapter.ts`**

Placeholder de integração real — endpoint/payload a confirmar contra a doc oficial do Salvy antes de produção (ver aviso no topo desta Task):

```ts
// src/features/messaging/channels/salvy/adapter.ts
import type { ChannelAdapter, HealthResult, SendInput, SendResult } from '../types';
import { salvyCredentialsSchema, type SalvyCredentials } from './schema';

const SALVY_BASE = 'https://api.salvy.com.br/v1';

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials: SalvyCredentials = salvyCredentialsSchema.parse(rawCredentials);
  const response = await fetch(`${SALVY_BASE}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: input.toPhone, message: input.body }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return { ok: false, retryable: response.status >= 500, reason: payload.message ?? 'Falha desconhecida no Salvy.' };
  }
  return { ok: true, externalId: payload.id };
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials: SalvyCredentials = salvyCredentialsSchema.parse(rawCredentials);
  const response = await fetch(`${SALVY_BASE}/account`, {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
  });
  if (response.ok) return { ok: true };
  const payload = await response.json();
  return { ok: false, reason: payload.message ?? 'Falha ao validar credencial do Salvy.' };
}

export const salvyAdapter: ChannelAdapter = {
  provider: 'SALVY',
  capabilities: {
    supportsFreeText: true,
    requiresApprovedTemplate: false,
    supportsInboundReply: true,
    supportsDeliveryReceipt: false,
    maxBodyLength: 1000,
    rateLimitPerMinute: 60,
  },
  send,
  healthCheck,
};
```

- [ ] **Step 5: Rodar e confirmar sucesso**

Run: `pnpm vitest run src/features/messaging/channels/salvy/adapter.test.ts`
Expected: PASS.

- [ ] **Step 6: Rodar o teste do registry da Task 2 (agora deve fechar)**

Run: `pnpm vitest run src/features/messaging/channels/registry.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/features/messaging/channels/salvy
git commit -m "feat(messaging): add Salvy adapter (endpoint pending official doc confirmation)"
```

---

### Task 6: `features/messaging/schema.ts`

**Files:**
- Create: `src/features/messaging/schema.ts`

**Interfaces:**
- Consumes: `metaCloudCredentialsSchema`, `evolutionCredentialsSchema`, `salvyCredentialsSchema` das Tasks 3–5.
- Produces: `saveChannelCredentialsSchema` (Zod discriminated union por `provider`), tipo `SaveChannelCredentialsInput`.

- [ ] **Step 1: Implementar**

```ts
// src/features/messaging/schema.ts
import { z } from 'zod';
import { metaCloudCredentialsSchema } from './channels/meta-cloud/schema';
import { evolutionCredentialsSchema } from './channels/evolution/schema';
import { salvyCredentialsSchema } from './channels/salvy/schema';

export const saveChannelCredentialsSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('META_CLOUD'), credentials: metaCloudCredentialsSchema }),
  z.object({
    provider: z.literal('EVOLUTION'),
    credentials: evolutionCredentialsSchema,
    riskAccepted: z.literal(true, { errorMap: () => ({ message: 'Confirme que está ciente do risco antes de salvar.' }) }),
  }),
  z.object({ provider: z.literal('SALVY'), credentials: salvyCredentialsSchema }),
]);

export type SaveChannelCredentialsInput = z.infer<typeof saveChannelCredentialsSchema>;
```

Nota: `riskAccepted` só existe no branch `EVOLUTION` porque é o único provider com o aviso de risco — variação por dado da união discriminada, não `if` de comportamento fora do adapter. Sem teste dedicado aqui: a Task 8 (`service.integration.test.ts`) exercita esse schema pelas chamadas reais de `saveChannelCredentials`.

- [ ] **Step 2: Commit**

```bash
git add src/features/messaging/schema.ts
git commit -m "feat(messaging): add saveChannelCredentials Zod schema"
```

---

### Task 7: `features/messaging/queries.ts`

**Files:**
- Create: `src/features/messaging/queries.ts`
- Test: `src/features/messaging/queries.integration.test.ts`

**Interfaces:**
- Produces: `ChannelConfigDTO`, `listChannelConfigs(): Promise<ChannelConfigDTO[]>`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/messaging/queries.integration.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listChannelConfigs } from './queries';

afterEach(async () => {
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

describe('listChannelConfigs', () => {
  it('devolve os 3 providers mesmo sem nenhuma linha no banco', async () => {
    const rows = await listChannelConfigs();

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.provider).sort()).toEqual(['EVOLUTION', 'META_CLOUD', 'SALVY']);
    expect(rows.every((r) => r.configured === false)).toBe(true);
  });

  it('marca configured=true e nunca inclui credentials quando existe linha', async () => {
    await db.channelConfig.create({
      data: { provider: 'META_CLOUD', label: 'Meta Cloud', credentials: 'ciphertext', isActive: true },
    });

    const rows = await listChannelConfigs();
    const meta = rows.find((r) => r.provider === 'META_CLOUD');

    expect(meta?.configured).toBe(true);
    expect(meta?.isActive).toBe(true);
    expect(meta).not.toHaveProperty('credentials');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run --config vitest.integration.config.ts src/features/messaging/queries.integration.test.ts` (ajuste o comando pro runner de integração já usado no projeto — ver `package.json`, script `test:integration` se existir; senão `pnpm vitest run` cobre, pois o include do `vitest.config.ts` exclui `*.integration.test.ts`, então confirme o script real antes de rodar)

Expected: FAIL — `./queries` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/messaging/queries.ts
import { db } from '@/lib/db';
import type { ChannelProvider } from '@prisma/client';

const ALL_PROVIDERS: ChannelProvider[] = ['META_CLOUD', 'EVOLUTION', 'SALVY'];

const PROVIDER_LABELS: Record<ChannelProvider, string> = {
  META_CLOUD: 'Meta Cloud API',
  EVOLUTION: 'Evolution API',
  SALVY: 'Salvy',
};

export type ChannelConfigDTO = {
  provider: ChannelProvider;
  configured: boolean;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  phoneNumber: string | null;
  riskAcceptedAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastError: string | null;
};

export async function listChannelConfigs(): Promise<ChannelConfigDTO[]> {
  const rows = await db.channelConfig.findMany({
    where: { provider: { in: ALL_PROVIDERS } },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return ALL_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (!row) {
      return {
        provider,
        configured: false,
        label: PROVIDER_LABELS[provider],
        isActive: false,
        isDefault: false,
        phoneNumber: null,
        riskAcceptedAt: null,
        lastCheckAt: null,
        lastCheckOk: null,
        lastError: null,
      };
    }
    return {
      provider,
      configured: true,
      label: row.label,
      isActive: row.isActive,
      isDefault: row.isDefault,
      phoneNumber: row.phoneNumber,
      riskAcceptedAt: row.riskAcceptedAt?.toISOString() ?? null,
      lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
      lastError: row.lastError,
    };
  });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/queries.ts src/features/messaging/queries.integration.test.ts
git commit -m "feat(messaging): add listChannelConfigs query"
```

---

### Task 8: `features/messaging/service.ts`

**Files:**
- Create: `src/features/messaging/service.ts`
- Test: `src/features/messaging/service.integration.test.ts`

**Interfaces:**
- Consumes: `resolveAdapter` (Task 2), `saveChannelCredentialsSchema`/`SaveChannelCredentialsInput` (Task 6), `encrypt`/`decrypt` de `@/lib/crypto` (já existe, `purpose: 'channel.credentials'`), `DomainError` de `@/lib/errors`.
- Produces: `saveChannelCredentials(input)`, `testChannelConnection(provider)`, `setChannelActive(provider, active)`, `setDefaultChannel(provider)`; erros `EvolutionRiskNotAcceptedError`, `ChannelNotVerifiedError`.

- [ ] **Step 1: Escrever o teste (falho)**

```ts
// src/features/messaging/service.integration.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import {
  saveChannelCredentials,
  testChannelConnection,
  setChannelActive,
  setDefaultChannel,
  EvolutionRiskNotAcceptedError,
  ChannelNotVerifiedError,
} from './service';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 7).toString('base64');

afterEach(async () => {
  vi.restoreAllMocks();
  await db.channelConfig.deleteMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION', 'SALVY'] } } });
});

describe('saveChannelCredentials', () => {
  it('salva e cripta — chamar duas vezes não duplica a linha', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a2', phoneNumberId: 'b', wabaId: 'c' } });

    const rows = await db.channelConfig.findMany({ where: { provider: 'META_CLOUD' } });
    expect(rows).toHaveLength(1);
    expect(rows[0].credentials).not.toContain('a2');
  });

  it('rejeita EVOLUTION sem riskAccepted', async () => {
    await expect(
      saveChannelCredentials({
        provider: 'EVOLUTION',
        credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' },
        riskAccepted: true,
      } as never),
    ).resolves.toBeUndefined();

    await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });

    // @ts-expect-error -- omitindo riskAccepted de propósito pra testar a trava do service
    await expect(saveChannelCredentials({ provider: 'EVOLUTION', credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' } }))
      .rejects.toThrow(EvolutionRiskNotAcceptedError);
  });
});

describe('testChannelConnection', () => {
  it('grava lastCheckOk=true e retorna ok quando o adapter confirma', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b' }) }));

    const result = await testChannelConnection('META_CLOUD');

    expect(result).toEqual({ ok: true });
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.lastCheckOk).toBe(true);
    vi.unstubAllGlobals();
  });

  it('grava lastError quando o adapter falha', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'token inválido' } }) }));

    const result = await testChannelConnection('META_CLOUD');

    expect(result).toEqual({ ok: false, reason: 'token inválido' });
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.lastCheckOk).toBe(false);
    expect(row.lastError).toBe('token inválido');
    vi.unstubAllGlobals();
  });
});

describe('setChannelActive', () => {
  it('rejeita ativar canal nunca testado', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    await expect(setChannelActive('META_CLOUD', true)).rejects.toThrow(ChannelNotVerifiedError);
  });

  it('permite ativar depois de um teste com sucesso', async () => {
    await saveChannelCredentials({ provider: 'META_CLOUD', credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b' }) }));
    await testChannelConnection('META_CLOUD');
    vi.unstubAllGlobals();

    await setChannelActive('META_CLOUD', true);

    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider: 'META_CLOUD' } });
    expect(row.isActive).toBe(true);
  });
});

describe('setDefaultChannel', () => {
  it('só um canal fica isDefault mesmo chamando pra dois em sequência', async () => {
    for (const provider of ['META_CLOUD', 'EVOLUTION'] as const) {
      await saveChannelCredentials(
        provider === 'META_CLOUD'
          ? { provider, credentials: { accessToken: 'a', phoneNumberId: 'b', wabaId: 'c' } }
          : { provider, credentials: { baseUrl: 'https://x.com', apiKey: 'k', instanceName: 'i' }, riskAccepted: true },
      );
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'b', instance: { state: 'open' } }) }));
      await testChannelConnection(provider);
      vi.unstubAllGlobals();
      await setChannelActive(provider, true);
    }

    await setDefaultChannel('META_CLOUD');
    await setDefaultChannel('EVOLUTION');

    const rows = await db.channelConfig.findMany({ where: { provider: { in: ['META_CLOUD', 'EVOLUTION'] } } });
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault)?.provider).toBe('EVOLUTION');
  });
});
```

- [ ] **Step 2: Rodar e confirmar falha**

Run: `pnpm vitest run src/features/messaging/service.integration.test.ts` (via o comando de integração real do projeto — checar `package.json`)
Expected: FAIL — `./service` não existe.

- [ ] **Step 3: Implementar**

```ts
// src/features/messaging/service.ts
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { resolveAdapter } from './channels/registry';
import type { SaveChannelCredentialsInput } from './schema';
import type { ChannelProvider } from '@prisma/client';

export class EvolutionRiskNotAcceptedError extends DomainError {
  constructor(cause?: unknown) {
    super('Confirme que está ciente do risco de banimento antes de salvar o Evolution.', 'EVOLUTION_RISK_NOT_ACCEPTED', { cause });
  }
}

export class ChannelNotVerifiedError extends DomainError {
  constructor(cause?: unknown) {
    super('Teste a conexão com sucesso antes de ativar este canal.', 'CHANNEL_NOT_VERIFIED', { cause });
  }
}

const LABELS: Record<ChannelProvider, string> = {
  META_CLOUD: 'Meta Cloud API',
  EVOLUTION: 'Evolution API',
  SALVY: 'Salvy',
};

export async function saveChannelCredentials(input: SaveChannelCredentialsInput): Promise<void> {
  if (input.provider === 'EVOLUTION' && input.riskAccepted !== true) {
    throw new EvolutionRiskNotAcceptedError();
  }

  const encrypted = encrypt(JSON.stringify(input.credentials), 'channel.credentials');
  await db.channelConfig.upsert({
    where: { provider: input.provider },
    create: {
      provider: input.provider,
      label: LABELS[input.provider],
      credentials: encrypted,
      riskAcceptedAt: input.provider === 'EVOLUTION' ? new Date() : null,
    },
    update: {
      credentials: encrypted,
      lastCheckAt: null,
      lastCheckOk: null,
      lastError: null,
      ...(input.provider === 'EVOLUTION' ? { riskAcceptedAt: new Date() } : {}),
    },
  });
}

export async function testChannelConnection(provider: ChannelProvider): Promise<{ ok: boolean; reason?: string }> {
  const row = await db.channelConfig.findUniqueOrThrow({ where: { provider } });
  const credentials = JSON.parse(decrypt(row.credentials, 'channel.credentials'));
  const result = await resolveAdapter(provider).healthCheck(credentials);

  await db.channelConfig.update({
    where: { provider },
    data: {
      lastCheckAt: new Date(),
      lastCheckOk: result.ok,
      lastError: result.ok ? null : result.reason,
    },
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

export async function setChannelActive(provider: ChannelProvider, active: boolean): Promise<void> {
  if (active) {
    const row = await db.channelConfig.findUniqueOrThrow({ where: { provider } });
    if (row.lastCheckOk !== true) throw new ChannelNotVerifiedError();
  }
  await db.channelConfig.update({ where: { provider }, data: { isActive: active } });
}

export async function setDefaultChannel(provider: ChannelProvider): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.channelConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.channelConfig.update({ where: { provider }, data: { isDefault: true } });
  });
}
```

- [ ] **Step 4: Rodar e confirmar sucesso**

Run: mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/service.ts src/features/messaging/service.integration.test.ts
git commit -m "feat(messaging): add channel config service (save, test, activate, set default)"
```

---

### Task 9: `features/messaging/actions.ts`

**Files:**
- Create: `src/features/messaging/actions.ts`

**Interfaces:**
- Consumes: `saveChannelCredentialsSchema` (Task 6), `saveChannelCredentials`/`testChannelConnection`/`setChannelActive`/`setDefaultChannel` (Task 8), `requireSession` de `@/features/auth/service`, `DomainError`, `logger`.
- Produces: `saveChannelCredentialsAction`, `testChannelConnectionAction`, `setChannelActiveAction`, `setDefaultChannelAction`.

- [ ] **Step 1: Implementar** (segue o padrão de `features/suppliers/actions.ts` — sem teste dedicado de action neste projeto, coberto pelo service integration test)

```ts
// src/features/messaging/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import type { ChannelProvider } from '@prisma/client';
import { saveChannelCredentialsSchema } from './schema';
import { saveChannelCredentials, testChannelConnection, setChannelActive, setDefaultChannel } from './service';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function saveChannelCredentialsAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = saveChannelCredentialsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }
    await saveChannelCredentials(parsed.data);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.saveCredentials', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function testChannelConnectionAction(provider: ChannelProvider): Promise<{ ok: boolean; reason?: string } | { error: { code: string; message: string } }> {
  try {
    await requireSession();
    const result = await testChannelConnection(provider);
    revalidatePath('/channels');
    return result;
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.testConnection', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function setChannelActiveAction(provider: ChannelProvider, active: boolean): Promise<ActionResult> {
  try {
    await requireSession();
    await setChannelActive(provider, active);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.setActive', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function setDefaultChannelAction(provider: ChannelProvider): Promise<ActionResult> {
  try {
    await requireSession();
    await setDefaultChannel(provider);
    revalidatePath('/channels');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'messaging.setDefault', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/messaging/actions.ts
git commit -m "feat(messaging): add channel config Server Actions"
```

---

### Task 10: Label pt-BR para `messages.messaging.*` + `CHANNEL_PROVIDER_LABELS`

**Files:**
- Modify: `src/lib/messages.ts`
- Modify: `src/lib/labels.ts`

**Interfaces:**
- Produces: `messages.messaging.{credentialsSaved, testOk, testFailed, activated, deactivated, defaultSet}`; `CHANNEL_PROVIDER_LABELS: Record<ChannelProvider, string>`.

- [ ] **Step 1: Adicionar em `messages.ts`**

```ts
  messaging: {
    credentialsSaved: 'Credenciais salvas.',
    testOk: 'Conexão testada com sucesso.',
    testFailed: 'Falha ao testar a conexão.',
    activated: 'Canal ativado.',
    deactivated: 'Canal desativado.',
    defaultSet: 'Canal definido como padrão.',
  },
```

Inserir como nova chave no objeto `messages`, ao lado de `settings`.

- [ ] **Step 2: Adicionar em `labels.ts`**

```ts
export const CHANNEL_PROVIDER_LABELS: Record<string, string> = {
  META_CLOUD: 'Meta Cloud API',
  EVOLUTION: 'Evolution API',
  SALVY: 'Salvy',
};
```

- [ ] **Step 3: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/lib/messages.ts src/lib/labels.ts
git commit -m "feat(messaging): add pt-BR labels and toast messages for channels"
```

---

### Task 11: Componentes de UI — badge, banner de risco, dialog de credenciais

**Files:**
- Create: `src/features/messaging/components/channel-status-badge.tsx`
- Create: `src/features/messaging/components/channel-risk-banner.tsx`
- Create: `src/features/messaging/components/channel-credentials-dialog.tsx`

**Interfaces:**
- Consumes: `StatusBadge` de `@/components/ui/status-badge`, `Dialog*` de `@/components/ui/dialog`, `Button`/`Input`/`Label` de `@/components/ui/*`, `saveChannelCredentialsAction` (Task 9), `ChannelConfigDTO` (Task 7), `toastError`/`toastSuccess`, `messages.messaging`.
- Produces: `ChannelStatusBadge`, `ChannelRiskBanner`, `ChannelCredentialsDialog`.

- [ ] **Step 1: `channel-status-badge.tsx`**

```tsx
// src/features/messaging/components/channel-status-badge.tsx
import { StatusBadge } from '@/components/ui/status-badge';
import type { ChannelConfigDTO } from '../queries';

export function ChannelStatusBadge({ config }: { config: ChannelConfigDTO }) {
  if (!config.configured) return <StatusBadge tone="neutral">Não configurado</StatusBadge>;
  if (config.isActive) return <StatusBadge tone="success">Ativo{config.isDefault ? ' · padrão' : ''}</StatusBadge>;
  if (config.lastCheckOk === false) return <StatusBadge tone="danger">Falha no teste</StatusBadge>;
  return <StatusBadge tone="warning">Configurado, inativo</StatusBadge>;
}
```

- [ ] **Step 2: `channel-risk-banner.tsx`**

```tsx
// src/features/messaging/components/channel-risk-banner.tsx
import { TriangleAlert } from 'lucide-react';

export function ChannelRiskBanner({ accepted, onAcceptedChange }: { accepted: boolean; onAcceptedChange: (value: boolean) => void }) {
  return (
    <div className="mb-4 rounded-sm border border-warning/40 bg-warning/[.08] p-3">
      <div className="mb-2 flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warning" />
        <p>
          A Evolution API viola os Termos de Uso do WhatsApp. Banimento do número é questão de
          quando, não de se. O servidor e o número são de sua responsabilidade — o sistema só
          fala com a instância que você provisionar.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm text-foreground-muted">
        <input type="checkbox" checked={accepted} onChange={(e) => onAcceptedChange(e.target.checked)} />
        Estou ciente do risco e quero continuar.
      </label>
    </div>
  );
}
```

- [ ] **Step 3: `channel-credentials-dialog.tsx`**

```tsx
// src/features/messaging/components/channel-credentials-dialog.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveChannelCredentialsSchema } from '../schema';
import { saveChannelCredentialsAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { CHANNEL_PROVIDER_LABELS } from '@/lib/labels';
import { ChannelRiskBanner } from './channel-risk-banner';
import type { ChannelProvider } from '@prisma/client';

type FormValues = { accessToken: string; phoneNumberId: string; wabaId: string; baseUrl: string; apiKey: string; instanceName: string };

export function ChannelCredentialsDialog({ open, onOpenChange, provider }: { open: boolean; onOpenChange: (open: boolean) => void; provider: ChannelProvider }) {
  const [riskAccepted, setRiskAccepted] = useState(false);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<FormValues>({
    defaultValues: { accessToken: '', phoneNumberId: '', wabaId: '', baseUrl: '', apiKey: '', instanceName: '' },
  });

  async function onSubmit(values: FormValues) {
    const payload =
      provider === 'META_CLOUD'
        ? { provider, credentials: { accessToken: values.accessToken, phoneNumberId: values.phoneNumberId, wabaId: values.wabaId } }
        : provider === 'EVOLUTION'
          ? { provider, credentials: { baseUrl: values.baseUrl, apiKey: values.apiKey, instanceName: values.instanceName }, riskAccepted: true as const }
          : { provider, credentials: { apiKey: values.apiKey } };

    const parsed = saveChannelCredentialsSchema.safeParse(payload);
    if (!parsed.success) {
      toastError({ code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput });
      return;
    }

    const result = await saveChannelCredentialsAction(parsed.data);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(messages.messaging.credentialsSaved);
    reset();
    setRiskAccepted(false);
    onOpenChange(false);
  }

  const canSubmit = provider !== 'EVOLUTION' || riskAccepted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurar {CHANNEL_PROVIDER_LABELS[provider]}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          {provider === 'EVOLUTION' && <ChannelRiskBanner accepted={riskAccepted} onAcceptedChange={setRiskAccepted} />}

          {provider === 'META_CLOUD' && (
            <>
              <div>
                <Label htmlFor="accessToken">Token de acesso</Label>
                <Input id="accessToken" type="password" {...register('accessToken')} />
              </div>
              <div>
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input id="phoneNumberId" {...register('phoneNumberId')} />
              </div>
              <div>
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input id="wabaId" {...register('wabaId')} />
              </div>
            </>
          )}

          {provider === 'EVOLUTION' && (
            <>
              <div>
                <Label htmlFor="baseUrl">URL do servidor</Label>
                <Input id="baseUrl" {...register('baseUrl')} />
              </div>
              <div>
                <Label htmlFor="apiKey">API key</Label>
                <Input id="apiKey" type="password" {...register('apiKey')} />
              </div>
              <div>
                <Label htmlFor="instanceName">Nome da instância</Label>
                <Input id="instanceName" {...register('instanceName')} />
              </div>
            </>
          )}

          {provider === 'SALVY' && (
            <div>
              <Label htmlFor="apiKey">API key</Label>
              <Input id="apiKey" type="password" {...register('apiKey')} />
            </div>
          )}

          <Button type="submit" disabled={isSubmitting || !canSubmit}>
            Salvar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros. Se `Input`/`Label` não existirem com essa API exata, ajustar imports pro nome real em `src/components/ui/` (checar `input.tsx`/`label.tsx` antes deste step).

- [ ] **Step 5: Commit**

```bash
git add src/features/messaging/components/channel-status-badge.tsx src/features/messaging/components/channel-risk-banner.tsx src/features/messaging/components/channel-credentials-dialog.tsx
git commit -m "feat(messaging): add channel status badge, risk banner and credentials dialog"
```

---

### Task 12: `ChannelGrid` (client) — card, testar, ativar, padrão

**Files:**
- Create: `src/features/messaging/components/channel-grid.tsx`

**Interfaces:**
- Consumes: `ChannelConfigDTO[]` (Task 7), `ChannelCredentialsDialog` (Task 11), `testChannelConnectionAction`/`setChannelActiveAction`/`setDefaultChannelAction` (Task 9).
- Produces: `ChannelGrid`.

- [ ] **Step 1: Implementar**

```tsx
// src/features/messaging/components/channel-grid.tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { formatLocalDate } from '@/lib/format';
import { messages } from '@/lib/messages';
import { toastError, toastSuccess } from '@/lib/toast';
import { CHANNEL_PROVIDER_LABELS } from '@/lib/labels';
import { ChannelStatusBadge } from './channel-status-badge';
import { ChannelCredentialsDialog } from './channel-credentials-dialog';
import { testChannelConnectionAction, setChannelActiveAction, setDefaultChannelAction } from '../actions';
import type { ChannelConfigDTO } from '../queries';
import type { ChannelProvider } from '@prisma/client';

export function ChannelGrid({ configs, timezone }: { configs: ChannelConfigDTO[]; timezone: string }) {
  const [editingProvider, setEditingProvider] = useState<ChannelProvider | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTest(provider: ChannelProvider) {
    startTransition(async () => {
      const result = await testChannelConnectionAction(provider);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      if (result.ok) toastSuccess(messages.messaging.testOk);
      else toastError({ code: 'CHANNEL_TEST_FAILED', message: result.reason ?? messages.messaging.testFailed });
    });
  }

  function handleToggleActive(provider: ChannelProvider, active: boolean) {
    startTransition(async () => {
      const result = await setChannelActiveAction(provider, active);
      if ('error' in result) toastError(result.error);
      else toastSuccess(active ? messages.messaging.activated : messages.messaging.deactivated);
    });
  }

  function handleSetDefault(provider: ChannelProvider) {
    startTransition(async () => {
      const result = await setDefaultChannelAction(provider);
      if ('error' in result) toastError(result.error);
      else toastSuccess(messages.messaging.defaultSet);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {configs.map((config) => (
        <div key={config.provider} className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-foreground">{CHANNEL_PROVIDER_LABELS[config.provider]}</p>
            <ChannelStatusBadge config={config} />
          </div>
          {config.phoneNumber && <p className="text-sm text-foreground-muted">{config.phoneNumber}</p>}
          {config.lastCheckAt && (
            <p className="mt-1 text-xs text-foreground-muted">
              Último teste: {formatLocalDate(config.lastCheckAt, timezone)} — {config.lastCheckOk ? 'ok' : config.lastError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => setEditingProvider(config.provider)}>
              {config.configured ? 'Editar' : 'Configurar'}
            </Button>
            {config.configured && (
              <Button type="button" variant="secondary" disabled={isPending} onClick={() => handleTest(config.provider)}>
                Testar conexão
              </Button>
            )}
            {config.configured && (
              <label className="flex items-center gap-1.5 text-sm text-foreground-muted" title={config.lastCheckOk ? undefined : 'Teste a conexão com sucesso antes de ativar.'}>
                <input
                  type="checkbox"
                  checked={config.isActive}
                  disabled={isPending || (!config.isActive && config.lastCheckOk !== true)}
                  onChange={(e) => handleToggleActive(config.provider, e.target.checked)}
                />
                Ativo
              </label>
            )}
            {config.isActive && (
              <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
                <input type="radio" name="default-channel" checked={config.isDefault} disabled={isPending} onChange={() => handleSetDefault(config.provider)} />
                Padrão
              </label>
            )}
          </div>
        </div>
      ))}
      {editingProvider && (
        <ChannelCredentialsDialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)} provider={editingProvider} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rodar typecheck**

Run: `pnpm tsc --noEmit`
Expected: sem erros. Confirmar antes se `Button` aceita prop `variant="secondary"` (checar `src/components/ui/button.tsx`); se o nome da variante divergir, usar a variante equivalente já existente no componente.

- [ ] **Step 3: Commit**

```bash
git add src/features/messaging/components/channel-grid.tsx
git commit -m "feat(messaging): add ChannelGrid with test/activate/default actions"
```

---

### Task 13: Rota `/channels` + sidebar

**Files:**
- Create: `src/app/(app)/channels/page.tsx`
- Modify: `src/components/layout/sidebar.tsx`

**Interfaces:**
- Consumes: `listChannelConfigs` (Task 7), `getSettings` de `@/features/settings/queries`, `ChannelGrid` (Task 12), `AppShell` de `@/components/layout/app-shell`.

- [ ] **Step 1: Criar a página**

```tsx
// src/app/(app)/channels/page.tsx
import { AppShell } from '@/components/layout/app-shell';
import { listChannelConfigs } from '@/features/messaging/queries';
import { getSettings } from '@/features/settings/queries';
import { ChannelGrid } from '@/features/messaging/components/channel-grid';

export default async function ChannelsPage() {
  const [configs, settings] = await Promise.all([listChannelConfigs(), getSettings()]);

  return (
    <AppShell title="Canais">
      <ChannelGrid configs={configs} timezone={settings.timezone} />
    </AppShell>
  );
}
```

- [ ] **Step 2: Adicionar item na sidebar**

Em `src/components/layout/sidebar.tsx`, importar o ícone `Radio` de `lucide-react` e inserir no array `MENU_ITEMS`, antes do item `Ajustes`:

```ts
  { href: '/channels', label: 'Canais', icon: Radio },
```

- [ ] **Step 3: Rodar o gate completo**

Run: `pnpm tsc --noEmit`
Run: `pnpm lint`
Run: `pnpm test`
Expected: os 3 passam. Nenhum warning novo introduzido pelas Tasks 1–13 (os pré-existentes em `plan-drawer.tsx`/`settings-form.tsx`/`subscription-drawer.tsx`/`lib/db.ts` não são desta spec).

- [ ] **Step 4: Grep de fronteira do adapter**

Run: `grep -rn "META_CLOUD\|EVOLUTION\|SALVY" src/ --include=*.ts --include=*.tsx | grep -v "features/messaging"`

Expected: só ocorrências de import de tipo (`ChannelProvider`) ou string literal em UI (labels, sidebar não deveria ter, componentes já cobertos) — nenhum `if (provider === ...)` de comportamento fora de `features/messaging`.

- [ ] **Step 5: Commit**

```bash
git add src/app/'(app)'/channels/page.tsx src/components/layout/sidebar.tsx
git commit -m "feat(messaging): add /channels page and sidebar entry"
```

---

### Task 14: Fechar a spec — `.env.example` e checklist

**Files:**
- Modify: `.env.example` (se existir; senão criar a partir do padrão do projeto)
- Modify: `docs/superpowers/specs/2026-08-08-etapa-3a-fundacao-canal-design.md` (nenhuma mudança de conteúdo — só confirmar que o "critério de pronto" está coberto)

**Interfaces:** nenhuma nova — task de fechamento.

- [ ] **Step 1: Confirmar `CREDENTIAL_KEY` documentado**

`CREDENTIAL_KEY` já é usado por `lib/crypto.ts` desde a Etapa 0 (senha de acesso do assinante) — confirmar que já está em `.env.example`/docs de deploy. Se não estiver, adicionar uma linha com comentário explicando que agora também protege credencial de canal:

```
CREDENTIAL_KEY=   # AES-256-GCM, 32 bytes em base64 — protege senha de acesso do assinante e credencial de canal WhatsApp
```

- [ ] **Step 2: Rodar o gate completo de novo (confirmação final)**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: tudo verde.

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "docs: note CREDENTIAL_KEY now also protects channel credentials"
```

---

## Self-review (spec coverage)

| Item da spec 3a | Task |
|---|---|
| Schema `ChannelConfig` + `riskAcceptedAt` + índice único parcial `is_default` | 1 |
| Interface `ChannelAdapter` + capabilities + registry | 2 |
| Adapter `META_CLOUD` | 3 |
| Adapter `EVOLUTION` | 4 |
| Adapter `SALVY` (com ressalva de doc a confirmar) | 5 |
| `saveChannelCredentialsSchema` (Zod) | 6 |
| `listChannelConfigs` / DTO sem `credentials` | 7 |
| `saveChannelCredentials`, `testChannelConnection`, `setChannelActive`, `setDefaultChannel` + erros de domínio | 8 |
| Server Actions finas | 9 |
| Labels pt-BR | 10 |
| Badge, banner de risco, dialog de credenciais | 11 |
| Grid com testar/ativar/padrão | 12 |
| Rota `/channels` + sidebar | 13 |
| Fechamento (env, gate final) | 14 |

Fora de escopo desta spec, confirmado: editor de template, envio manual/lote, timeline de mensagens, webhook de opt-out — ficam pras specs 3b/3c, não há task aqui que os toque.
