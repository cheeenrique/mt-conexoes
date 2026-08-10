import { ZodError } from 'zod';
import type { ChannelAdapter, HealthResult, SendInput, SendResult } from '../types';
import { ChannelCredentialsInvalidError } from '../types';
import { salvyCredentialsSchema, type SalvyCredentials } from './schema';

// ⚠️ Endpoint/payload best-effort — não confirmado contra a doc oficial do Salvy
// (sem acesso a web-fetch neste ambiente). Validar contra credencial real antes de produção.
const SALVY_BASE = 'https://api.salvy.com.br/v1';
const FETCH_TIMEOUT_MS = 10_000;

function parseCredentials(rawCredentials: unknown): SalvyCredentials {
  try {
    return salvyCredentialsSchema.parse(rawCredentials);
  } catch (err) {
    if (err instanceof ZodError) throw new ChannelCredentialsInvalidError(err);
    throw err;
  }
}

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials = parseCredentials(rawCredentials);
  try {
    const response = await fetch(`${SALVY_BASE}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credentials.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: input.toPhone, message: input.body }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const payload = await response.json();
      return { ok: false, retryable: response.status >= 500, reason: payload.message ?? 'Falha desconhecida no Salvy.' };
    }

    const payload = await response.json();
    const externalId = payload?.id;
    if (typeof externalId !== 'string') {
      return { ok: false, retryable: false, reason: 'Resposta inesperada do Salvy.' };
    }
    return { ok: true, externalId };
  } catch (err) {
    return { ok: false, retryable: true, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com o Salvy.' };
  }
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials = parseCredentials(rawCredentials);
  try {
    const response = await fetch(`${SALVY_BASE}/account`, {
      headers: { Authorization: `Bearer ${credentials.apiKey}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    const payload = await response.json();
    return { ok: false, reason: payload.message ?? 'Falha ao validar credencial do Salvy.' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com o Salvy.' };
  }
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
  // ⚠️ Webhook do Salvy fora de escopo desta spec — sempre recusa/ignora.
  verifyWebhookSignature: () => false,
  parseInboundWebhook: () => null,
};
