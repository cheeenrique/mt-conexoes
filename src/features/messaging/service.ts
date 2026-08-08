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
