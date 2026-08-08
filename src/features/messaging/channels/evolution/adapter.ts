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
