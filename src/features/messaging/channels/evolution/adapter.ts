import { timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import type { ChannelAdapter, ConnectionEvent, HealthResult, InboundMessage, SendInput, SendResult } from '../types';
import { ChannelCredentialsInvalidError } from '../types';
import type { PairableChannel } from '../pairing';
import { evolutionCredentialsSchema, type EvolutionCredentials } from './schema';
import { evolutionDescriptor } from './descriptor';
import { evolutionPairing } from './pairing';
import { providerFailureReason } from '../provider-error';

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
    return {
      ok: false,
      retryable: true,
      reason: providerFailureReason(
        { provider: 'EVOLUTION', op: 'send' },
        err,
        'Não foi possível alcançar o servidor Evolution. Confira o endereço e se ele está no ar.',
      ),
    };
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
    return {
      ok: false,
      reason: providerFailureReason(
        { provider: 'EVOLUTION', op: 'healthCheck' },
        err,
        'Não foi possível alcançar o servidor Evolution. Confira o endereço e se ele está no ar.',
      ),
    };
  }
}

/**
 * A Evolution só entrega o `apikey` do operador como **header HTTP**, e só quando a
 * instância foi criada/atualizada com `webhook.headers.apikey` — confirmado rodando a
 * stack local (tag 2.3.7): sem esse campo, o header não existe.
 *
 * ⚠️ O `apikey` que vem no **corpo** de todo evento (`{ ..., apikey: "..." }`) NÃO é este
 * segredo — é o token interno da instância (o mesmo de `POST /instance/create` → `hash`),
 * gerado pela Evolution e sem relação com o `webhookToken` que o operador escolhe aqui.
 * Comparar o corpo contra `webhookToken` nunca bateria; aceitar o corpo sem comparar seria
 * autenticação falsa. Por isso só o header é conferido.
 */
function verifyWebhookSignature(rawBody: string, headers: Headers, rawCredentials: unknown): boolean {
  const credentials = parseCredentials(rawCredentials);
  const header = headers.get('apikey');
  if (!header) return false;

  const expected = Buffer.from(credentials.webhookToken);
  const received = Buffer.from(header);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}

/**
 * `connection.update` é o único jeito de saber que a sessão do WhatsApp caiu sem esperar
 * o próximo `healthCheck`, e é também como o pareamento por QR fecha o laço. Confirmado
 * rodando a stack local (tag 2.3.7):
 * `{ event: 'connection.update', data: { state: 'open' | 'close' | 'connecting', ... } }`.
 * `'connecting'` é reconexão automática em andamento — não é sinal de queda nem de volta.
 *
 * No evento de `'open'` a Evolution acrescenta `wuid` (`5565999998888@s.whatsapp.net`) —
 * é dali que sai o número remetente que a tela mostra, e não de um campo digitado.
 */
function parseConnectionEvent(rawBody: string): ConnectionEvent | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) return null;
  if ((payload as { event?: unknown }).event !== 'connection.update') return null;

  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;

  const state = (data as { state?: unknown }).state;
  if (state !== 'open' && state !== 'close' && state !== 'connecting') return null;

  const wuid = (data as { wuid?: unknown }).wuid;
  const phone = typeof wuid === 'string' ? wuid.split('@')[0] : undefined;

  return phone ? { state, phone: `+${phone}` } : { state };
}

// ⚠️ Formato do payload de webhook do Evolution não confirmado contra a doc
// oficial nesta spec — best-effort, mesma ressalva do adapter de envio.
// Assumido: `{ event: 'messages.upsert', data: { key: { remoteJid, fromMe }, message: { conversation } } }`.
function parseInboundWebhook(rawBody: string): InboundMessage[] | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return null;

  const key = (data as { key?: unknown }).key;
  if (typeof key !== 'object' || key === null) return null;

  const fromMe = (key as { fromMe?: unknown }).fromMe;
  if (fromMe === true) return null;

  const remoteJid = (key as { remoteJid?: unknown }).remoteJid;
  if (typeof remoteJid !== 'string') return null;

  const message = (data as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;

  const conversation = (message as { conversation?: unknown }).conversation;
  if (typeof conversation !== 'string') return null;

  const fromPhone = remoteJid.split('@')[0];
  if (!fromPhone) return null;

  return [{ fromPhone, text: conversation }];
}

export const evolutionAdapter: ChannelAdapter & PairableChannel = {
  provider: 'EVOLUTION',
  descriptor: evolutionDescriptor,
  capabilities: {
    supportsFreeText: true,
    requiresApprovedTemplate: false,
    maxBodyLength: 4096,
    rateLimitPerMinute: 20,
  },
  send,
  healthCheck,
  verifyWebhookSignature,
  parseInboundWebhook,
  parseConnectionEvent,
  ...evolutionPairing,
};
