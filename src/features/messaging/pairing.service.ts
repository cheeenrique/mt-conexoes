import { randomBytes } from 'node:crypto';
import type { ChannelProvider } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { requireEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { resolveAdapter, resolveDescriptor } from './channels/registry';
import { isPairable, type PairableChannel, type PairingChallenge } from './channels/pairing';
import { redactSecrets } from './channels/redact';
import type { BeginChannelPairingInput } from './schema';
import { ChannelNotConfiguredError, ChannelRiskNotAcceptedError } from './service';
import { providerFailureReason } from './channels/provider-error';

export class ChannelPairingNotSupportedError extends DomainError {
  constructor(cause?: unknown) {
    super('Este canal não conecta por leitura de QR Code.', 'CHANNEL_PAIRING_NOT_SUPPORTED', { cause });
  }
}

export class ChannelPairingFailedError extends DomainError {
  constructor(reason: string, cause?: unknown) {
    super(reason, 'CHANNEL_PAIRING_FAILED', { cause });
  }
}

/**
 * ⚠️ O desafio não é persistido em lugar nenhum: sai daqui para a Server Action, vira prop
 * e morre com o diálogo. QR do WhatsApp expira em menos de um minuto. Nem `qrBase64` nem
 * `pairingCode` entram em log — mesma disciplina da revelação da senha do assinante.
 */
export type PairingChallengeDTO = PairingChallenge;

/**
 * Falha alto quando o descritor declara um caminho de pareamento e o adapter não implementa
 * `PairableChannel`. É o **único** consumidor de `isPairable()`: a tela pergunta ao descritor
 * quais caminhos existem, nunca qual é o provider.
 */
function requirePairable(provider: ChannelProvider, methodId?: string): PairableChannel {
  if (methodId !== undefined) {
    const method = resolveDescriptor(provider).connectionMethods.find((m) => m.id === methodId);
    if (!method || method.kind !== 'PAIRING') throw new ChannelPairingNotSupportedError();
  }
  const adapter = resolveAdapter(provider);
  if (!isPairable(adapter)) throw new ChannelPairingNotSupportedError();
  return adapter;
}

function webhookUrl(): string {
  return new URL('/api/webhooks/evolution', requireEnv('APP_URL')).toString();
}

async function storedCredentials(provider: ChannelProvider): Promise<Record<string, unknown> | null> {
  const row = await db.channelConfig.findUnique({ where: { provider } });
  if (!row) return null;
  return JSON.parse(decrypt(row.credentials, 'channel.credentials'));
}

function failure(err: unknown, provider: ChannelProvider, credentials: unknown): never {
  const reason = providerFailureReason(
    { provider, op: 'pairing' },
    err,
    'Não foi possível falar com o servidor do canal. Confira o endereço e se ele está no ar.',
  );
  throw new ChannelPairingFailedError(redactSecrets(reason, credentials, resolveDescriptor(provider)), err);
}

/**
 * Reabrir o diálogo não pode criar uma instância nova a cada clique — o servidor do operador
 * acumularia sessões órfãs, e `POST /instance/create` recusa nome repetido. Enquanto **tudo
 * que o operador digitou** continuar igual ao que está gravado, o pareamento segue de onde
 * parou; qualquer campo diferente (outro servidor, outro número) provisiona do zero.
 *
 * A comparação é por chave, sem saber o nome de nenhum campo: quem sabe a forma da
 * credencial é o adapter.
 */
async function resumePairing(
  provider: ChannelProvider,
  adapter: PairableChannel,
  typed: Record<string, unknown>,
): Promise<PairingChallenge | null> {
  const existing = await storedCredentials(provider);
  if (!existing) return null;
  if (!Object.entries(typed).every(([key, value]) => existing[key] === value)) return null;

  try {
    return await adapter.refreshChallenge(existing);
  } catch (err) {
    // Instância apagada no servidor, chave trocada: provisiona de novo em vez de travar.
    logger.warn({ route: 'messaging.beginPairing', provider, reason: 'resume-failed', error: String(err) });
    return null;
  }
}

/**
 * Cria a instância no servidor do operador e devolve o primeiro desafio.
 *
 * `instanceName` e `webhookToken` são gerados **aqui**, não digitados: pedir ao operador um
 * valor que precisa bater exatamente com o que foi configurado no provider é a origem de
 * "o PARE do cliente não chega" (T5). Os dois viram chaves do mesmo blob criptografado.
 */
export async function beginChannelPairing(input: BeginChannelPairingInput): Promise<PairingChallengeDTO> {
  const descriptor = resolveDescriptor(input.provider);
  const adapter = requirePairable(input.provider, input.methodId);
  const accepted = 'riskAccepted' in input && input.riskAccepted === true;
  if (descriptor.warning.requiresAcceptance && !accepted) throw new ChannelRiskNotAcceptedError();

  const resumed = await resumePairing(input.provider, adapter, input.credentials);
  if (resumed) return resumed;

  // O que o operador digitou + o que o painel gera. Campo que só serve ao pareamento
  // (o número que vai parear) fica no blob e é ignorado pelo schema de envio do adapter.
  const credentials = {
    ...input.credentials,
    instanceName: `painel-${randomBytes(6).toString('hex')}`,
    webhookToken: randomBytes(32).toString('hex'),
  };

  let challenge: PairingChallenge;
  try {
    challenge = await adapter.beginPairing(input.credentials, {
      instanceName: credentials.instanceName,
      webhookToken: credentials.webhookToken,
      webhookUrl: webhookUrl(),
    });
  } catch (err) {
    failure(err, input.provider, input.credentials);
  }

  await persistProvisioned(input.provider, descriptor.label, credentials, descriptor.warning.requiresAcceptance);
  return challenge;
}

/**
 * `lastCheckOk: null` de propósito — a instância existe, mas ninguém leu o QR ainda. `false`
 * dispararia o alarme de canal fora do ar no Início; `true` deixaria ativar um canal que
 * não envia. Ativar continua exigindo teste bem-sucedido (`setSendingChannel`).
 */
async function persistProvisioned(
  provider: ChannelProvider,
  label: string,
  credentials: Record<string, unknown>,
  requiresAcceptance: boolean,
): Promise<void> {
  const provisioned = {
    credentials: encrypt(JSON.stringify(credentials), 'channel.credentials'),
    lastCheckAt: null,
    lastCheckOk: null,
    lastError: null,
    phoneNumber: null,
    disconnectedAt: null,
    ...(requiresAcceptance ? { riskAcceptedAt: new Date() } : {}),
  };

  await db.channelConfig.upsert({
    where: { provider },
    create: { provider, label, ...provisioned },
    update: provisioned,
  });
}

/**
 * Troca só o número de um canal já pareado — endereço e chave continuam sendo os que já
 * estão salvos, nunca voltam pra tela pra serem redigitados. É pensado pro operador leigo:
 * ele não sabe (nem devia precisar saber) o que é "endereço da instância".
 *
 * `persistProvisioned` é reusado de propósito: o estado depois de trocar o número é
 * idêntico ao de um pareamento novo — canal existe, ainda não foi testado.
 */
export async function changeChannelNumber(provider: ChannelProvider, newPairingNumber: string): Promise<PairingChallengeDTO> {
  const adapter = requirePairable(provider);
  const existing = await storedCredentials(provider);
  if (!existing) throw new ChannelNotConfiguredError();

  let challenge: PairingChallenge;
  try {
    challenge = await adapter.changeNumber(existing, newPairingNumber, webhookUrl());
  } catch (err) {
    failure(err, provider, existing);
  }

  const descriptor = resolveDescriptor(provider);
  await persistProvisioned(
    provider,
    descriptor.label,
    { ...existing, pairingNumber: newPairingNumber },
    descriptor.warning.requiresAcceptance,
  );

  return challenge;
}

/**
 * O que a tela chama a cada ~45s enquanto o diálogo está aberto: o QR do WhatsApp expira em
 * menos de um minuto. Quando o provider já reporta a sessão aberta, o canal passa a testado
 * — é o mesmo `state: 'open'` que `healthCheck()` confere.
 *
 * O caminho normal de "pareou → conectado" é o `connection.update` do webhook; este é o
 * segundo, para quando o webhook ainda não chegou (ou o painel não está exposto).
 */
export async function refreshChannelPairing(provider: ChannelProvider): Promise<PairingChallengeDTO> {
  const adapter = requirePairable(provider);
  const credentials = await storedCredentials(provider);
  if (!credentials) throw new ChannelNotConfiguredError();

  let challenge: PairingChallenge;
  try {
    challenge = await adapter.refreshChallenge(credentials);
  } catch (err) {
    failure(err, provider, credentials);
  }

  if (challenge.state === 'CONNECTED') {
    await db.channelConfig.update({
      where: { provider },
      data: { lastCheckAt: new Date(), lastCheckOk: true, lastError: null, disconnectedAt: null },
    });
  }
  return challenge;
}

/** Desconecta o aparelho sem apagar a instância: reparear é ler um QR novo, não recriar nada. */
export async function unpairChannel(provider: ChannelProvider): Promise<void> {
  const adapter = requirePairable(provider);
  const credentials = await storedCredentials(provider);
  if (!credentials) throw new ChannelNotConfiguredError();

  try {
    await adapter.unpair(credentials);
  } catch (err) {
    failure(err, provider, credentials);
  }

  await db.channelConfig.update({
    where: { provider },
    data: {
      lastCheckAt: new Date(),
      lastCheckOk: false,
      lastError: 'Aparelho desconectado por aqui. Leia o QR Code de novo para voltar a enviar.',
      disconnectedAt: new Date(),
    },
  });
}
