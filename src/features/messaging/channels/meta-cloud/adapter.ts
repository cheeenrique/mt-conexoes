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
