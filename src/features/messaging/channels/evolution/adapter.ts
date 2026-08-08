import { ZodError } from 'zod';
import type { ChannelAdapter, HealthResult, SendInput, SendResult } from '../types';
import { ChannelCredentialsInvalidError } from '../types';
import { evolutionCredentialsSchema, type EvolutionCredentials } from './schema';

const FETCH_TIMEOUT_MS = 10_000;

function parseCredentials(rawCredentials: unknown): EvolutionCredentials {
  try {
    return evolutionCredentialsSchema.parse(rawCredentials);
  } catch (err) {
    if (err instanceof ZodError) throw new ChannelCredentialsInvalidError(err);
    throw err;
  }
}

async function send(input: SendInput, rawCredentials: unknown): Promise<SendResult> {
  const credentials = parseCredentials(rawCredentials);
  try {
    const response = await fetch(`${credentials.baseUrl}/message/sendText/${credentials.instanceName}`, {
      method: 'POST',
      headers: { apikey: credentials.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: input.toPhone, text: input.body }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const payload = await response.json();
      return { ok: false, retryable: response.status >= 500, reason: payload.message ?? 'Falha desconhecida no Evolution.' };
    }

    const payload = await response.json();
    const externalId = payload?.key?.id;
    if (typeof externalId !== 'string') {
      return { ok: false, retryable: false, reason: 'Resposta inesperada do Evolution.' };
    }
    return { ok: true, externalId };
  } catch (err) {
    return { ok: false, retryable: true, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com o Evolution.' };
  }
}

async function healthCheck(rawCredentials: unknown): Promise<HealthResult> {
  const credentials = parseCredentials(rawCredentials);
  try {
    const response = await fetch(`${credentials.baseUrl}/instance/connectionState/${credentials.instanceName}`, {
      headers: { apikey: credentials.apiKey },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, reason: 'Não foi possível falar com o servidor Evolution.' };
    const payload = await response.json();
    const state = payload.instance?.state;
    if (state === 'open') return { ok: true };
    return { ok: false, reason: `Instância Evolution desconectada (state: ${state}).` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Falha de rede ao falar com o servidor Evolution.' };
  }
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
