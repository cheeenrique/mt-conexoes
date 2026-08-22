import { ZodError } from 'zod';
import type { PairableChannel, PairingChallenge, PairingProvisionOptions, PairingState } from '../pairing';
import { ChannelCredentialsInvalidError } from '../types';
import {
  evolutionCredentialsSchema,
  evolutionPairingInputSchema,
  type EvolutionCredentials,
  type EvolutionPairingInput,
} from './schema';

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Eventos que o painel precisa receber. `MESSAGES_UPSERT` é o "PARE" do cliente (T5),
 * `CONNECTION_UPDATE` é como o pareamento fecha o laço e como a queda de sessão aparece,
 * `QRCODE_UPDATED` é o QR renovado enquanto o diálogo está aberto.
 */
const WEBHOOK_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];

const CALL_REJECTION_MESSAGE = 'Este número não recebe ligações. Se precisar de algo, mande uma mensagem por aqui.';

/**
 * O QR **não vem pronto** na resposta do `create`. Medido na stack local (tag 2.3.7): o
 * `create` levou 6,1s e voltou com `qrcode: { count: 0 }`; o QR só apareceu em
 * `GET /instance/connect` ~6,7s depois. É assíncrono — a Evolution só monta o QR quando o
 * Baileys emite o evento. Esperar aqui é o que evita entregar um diálogo vazio ao operador.
 */
const QR_WAIT_ATTEMPTS = 8;
const QR_WAIT_INTERVAL_MS = 1_500;

const STATE_BY_CONNECTION: Record<string, PairingState> = {
  open: 'CONNECTED',
  connecting: 'CONNECTING',
  close: 'DISCONNECTED',
};

function parseInput(raw: unknown): EvolutionPairingInput {
  try {
    return evolutionPairingInputSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new ChannelCredentialsInvalidError(err);
    throw err;
  }
}

function parseCredentials(raw: unknown): EvolutionCredentials {
  try {
    return evolutionCredentialsSchema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) throw new ChannelCredentialsInvalidError(err);
    throw err;
  }
}

/**
 * A Evolution devolve o motivo em `response.message`, que é **string ou lista de strings**
 * — nome de instância repetido volta como `["This name ... is already in use."]`. Conferido
 * na stack local (tag 2.3.7). Perder isso deixaria o operador com um número de status seco.
 */
function errorMessage(payload: unknown, status: number): string {
  const message =
    (payload as { response?: { message?: unknown } } | null)?.response?.message ??
    (payload as { message?: unknown } | null)?.message;

  if (typeof message === 'string') return message;
  if (Array.isArray(message) && message.every((part) => typeof part === 'string')) return message.join(' ');
  return `Evolution respondeu ${status}.`;
}

async function callEvolution(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: { apikey: apiKey, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return payload;
}

/**
 * `{ count, pairingCode, base64, code }` — a forma que o `create` devolve em `qrcode` e
 * que o `connect` devolve na raiz. `base64` já vem como data-URI PNG (confirmado na
 * stack local, tag 2.3.7); `pairingCode` só existe se a instância foi criada com `number`.
 */
function toChallenge(qr: unknown, state: PairingState): PairingChallenge {
  const source = typeof qr === 'object' && qr !== null ? (qr as Record<string, unknown>) : {};
  const qrBase64 = typeof source.base64 === 'string' ? source.base64 : undefined;
  const pairingCode = typeof source.pairingCode === 'string' ? source.pairingCode : undefined;
  return { qrBase64, pairingCode, state };
}

function connectionStateOf(payload: unknown): PairingState | null {
  const instance = (payload as { instance?: { state?: unknown } } | null)?.instance;
  const state = instance?.state;
  return typeof state === 'string' ? (STATE_BY_CONNECTION[state] ?? 'DISCONNECTED') : null;
}

/**
 * `GET /instance/connect/{name}` devolve o QR quando a sessão está `close`/`connecting`, e o
 * próprio connectionState quando já está `open` — as duas formas são tratadas porque é
 * exatamente isso que separa "renova o QR" de "pareou, pode fechar o diálogo".
 */
async function fetchChallenge(baseUrl: string, apiKey: string, instanceName: string): Promise<PairingChallenge> {
  const payload = await callEvolution(baseUrl, apiKey, `/instance/connect/${encodeURIComponent(instanceName)}`, {
    method: 'GET',
  });
  const connected = connectionStateOf(payload);
  if (connected) return { state: connected };
  return toChallenge(payload, 'AWAITING_SCAN');
}

/** Espera o QR ficar pronto. Estourado o orçamento, devolve `CONNECTING` e a tela repolla. */
async function waitForQrCode(baseUrl: string, apiKey: string, instanceName: string): Promise<PairingChallenge> {
  for (let attempt = 0; attempt < QR_WAIT_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, QR_WAIT_INTERVAL_MS));
    const challenge = await fetchChallenge(baseUrl, apiKey, instanceName);
    if (challenge.qrBase64 || challenge.state === 'CONNECTED') return challenge;
  }
  return { state: 'CONNECTING' };
}

/**
 * Cria a instância na Evolution do operador. Tudo que só dá para escolher **no momento da
 * criação** entra aqui, porque ninguém lembra depois:
 *
 * - `groupsIgnore`/`rejectCall`: default é `false` nos dois. Número de cobrança recebe
 *   ligação e pode ser jogado em grupo.
 * - `syncFullHistory: false`: `true` puxaria o histórico inteiro do WhatsApp dele para a
 *   máquina no pareamento.
 * - `webhook.headers.apikey`: nosso `webhookToken`, o que faz T5 funcionar.
 *
 * ⚠️ O `hash` que a resposta traz é o token **interno** da instância, gerado pela Evolution
 * — é o `apikey` que ela manda no **corpo** de cada evento. Não é o `webhookToken`, e
 * confundir os dois criaria autenticação falsa. Ele é ignorado de propósito.
 */
async function beginPairing(rawInput: unknown, options: PairingProvisionOptions): Promise<PairingChallenge> {
  const input = parseInput(rawInput);
  const payload = await callEvolution(input.baseUrl, input.apiKey, '/instance/create', {
    method: 'POST',
    body: {
      instanceName: options.instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      number: input.pairingNumber.replace(/\D/g, ''),
      groupsIgnore: true,
      rejectCall: true,
      msgCall: CALL_REJECTION_MESSAGE,
      syncFullHistory: false,
      webhook: {
        enabled: true,
        url: options.webhookUrl,
        events: WEBHOOK_EVENTS,
        headers: { apikey: options.webhookToken },
      },
    },
  });

  const immediate = toChallenge((payload as { qrcode?: unknown } | null)?.qrcode, 'AWAITING_SCAN');
  if (immediate.qrBase64) return immediate;
  return waitForQrCode(input.baseUrl, input.apiKey, options.instanceName);
}

async function refreshChallenge(rawCredentials: unknown): Promise<PairingChallenge> {
  const credentials = parseCredentials(rawCredentials);
  return fetchChallenge(credentials.baseUrl, credentials.apiKey, credentials.instanceName);
}

/** Desconecta o telefone e deixa a instância de pé — reparear não exige recriar nada. */
async function unpair(rawCredentials: unknown): Promise<void> {
  const credentials = parseCredentials(rawCredentials);
  await callEvolution(
    credentials.baseUrl,
    credentials.apiKey,
    `/instance/logout/${encodeURIComponent(credentials.instanceName)}`,
    { method: 'DELETE' },
  );
}

export const evolutionPairing: PairableChannel = { beginPairing, refreshChallenge, unpair };
