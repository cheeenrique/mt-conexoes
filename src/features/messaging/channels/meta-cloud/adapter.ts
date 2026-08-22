import { createHmac, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import type { ChannelAdapter, HealthResult, InboundMessage, SendInput, SendResult } from '../types';
import { ChannelCredentialsInvalidError } from '../types';
import { metaCloudCredentialsSchema, type MetaCloudCredentials } from './schema';
import { metaCloudDescriptor } from './descriptor';

const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const RATE_LIMIT_CODES = new Set([4, 80007, 130429]);
const FETCH_TIMEOUT_MS = 10_000;

function isRetryable(status: number, errorCode?: number): boolean {
  if (status >= 500) return true;
  if (errorCode !== undefined && RATE_LIMIT_CODES.has(errorCode)) return true;
  return false;
}

function parseCredentials(rawCredentials: unknown): MetaCloudCredentials {
  try {
    return metaCloudCredentialsSchema.parse(rawCredentials);
  } catch (err) {
    if (err instanceof ZodError) throw new ChannelCredentialsInvalidError(err);
    throw err;
  }
}

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials = parseCredentials(rawCredentials);
  if (!input.templateRef) {
    return { ok: false, retryable: false, reason: 'Passo sem template aprovado para o canal Meta Cloud.' };
  }

  try {
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
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const payload = await response.json();
      return { ok: false, retryable: isRetryable(response.status, payload.error?.code), reason: payload.error?.message ?? 'Falha desconhecida na Meta Cloud API.' };
    }

    const payload = await response.json();
    const externalId = payload?.messages?.[0]?.id;
    if (typeof externalId !== 'string') {
      return { ok: false, retryable: false, reason: 'Resposta inesperada da Meta Cloud API.' };
    }
    return { ok: true, externalId };
  } catch (err) {
    return { ok: false, retryable: true, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com a Meta Cloud API.' };
  }
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials = parseCredentials(rawCredentials);
  try {
    const response = await fetch(`${GRAPH_BASE}/${credentials.phoneNumberId}?fields=id`, {
      headers: { Authorization: `Bearer ${credentials.accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true };
    const payload = await response.json();
    return { ok: false, reason: payload.error?.message ?? 'Falha ao validar credencial da Meta Cloud API.' };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com a Meta Cloud API.' };
  }
}

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
  const entries = (payload as { entry?: unknown })?.entry;
  const messages: InboundMessage[] = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const changes = (entry as { changes?: unknown })?.changes;
    for (const change of Array.isArray(changes) ? changes : []) {
      const value = (change as { value?: { messages?: unknown } })?.value;
      const msgs = value?.messages;
      for (const msg of Array.isArray(msgs) ? msgs : []) {
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

export const metaCloudAdapter: ChannelAdapter = {
  provider: 'META_CLOUD',
  descriptor: metaCloudDescriptor,
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
  verifyWebhookSignature,
  parseInboundWebhook,
};
