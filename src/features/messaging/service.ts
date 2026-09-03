import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { encrypt, decrypt } from '@/lib/crypto';
import { ANONYMIZED_MESSAGE_BODY } from '@/core/anonymization';
import { resolveAdapter, resolveDescriptor } from './channels/registry';
import { redactSecrets } from './channels/redact';
import type { SaveChannelCredentialsInput } from './schema';
import { Prisma, type ChannelProvider } from '@prisma/client';

export class ChannelRiskNotAcceptedError extends DomainError {
  constructor(cause?: unknown) {
    super('Confirme que está ciente do risco deste canal antes de salvar.', 'CHANNEL_RISK_NOT_ACCEPTED', { cause });
  }
}

export class ChannelNotVerifiedError extends DomainError {
  constructor(cause?: unknown) {
    super('Salve e teste a conexão com sucesso antes de usar este canal.', 'CHANNEL_NOT_VERIFIED', { cause });
  }
}

export class ChannelNotConfiguredError extends DomainError {
  constructor(cause?: unknown) {
    super('Configure as credenciais deste canal antes de continuar.', 'CHANNEL_NOT_CONFIGURED', { cause });
  }
}

export type ChannelTestResult = { ok: true } | { ok: false; reason: string };

function riskAccepted(input: SaveChannelCredentialsInput): boolean {
  return 'riskAccepted' in input && input.riskAccepted === true;
}

/**
 * Salvar e testar é uma operação só, na ordem que importa: **testa primeiro**.
 * Credencial que não responde no provider não é gravada — o canal continua com a
 * que funcionava, e a régua não para no meio de uma troca de token.
 *
 * ⚠️ O teste valida a credencial no provider; **não** dispara mensagem para ninguém.
 */
export async function saveAndTestChannel(input: SaveChannelCredentialsInput): Promise<ChannelTestResult> {
  const descriptor = resolveDescriptor(input.provider);
  if (descriptor.warning.requiresAcceptance && !riskAccepted(input)) {
    throw new ChannelRiskNotAcceptedError();
  }

  const health = await resolveAdapter(input.provider).healthCheck(input.credentials);
  if (!health.ok) {
    return { ok: false, reason: redactSecrets(health.reason, input.credentials, descriptor) };
  }

  const now = new Date();
  const verified = {
    credentials: encrypt(JSON.stringify(input.credentials), 'channel.credentials'),
    lastCheckAt: now,
    lastCheckOk: true,
    lastError: null,
    ...(descriptor.warning.requiresAcceptance ? { riskAcceptedAt: now } : {}),
  };

  await db.channelConfig.upsert({
    where: { provider: input.provider },
    create: { provider: input.provider, label: descriptor.label, ...verified },
    // isActive/isDefault ficam como estavam: a credencial nova já passou no teste,
    // então rotacionar um token não tira do ar o canal que está enviando.
    update: verified,
  });

  return { ok: true };
}

/** Reconfere a credencial já gravada. É como o operador redescobre um canal que caiu. */
export async function testChannelConnection(provider: ChannelProvider): Promise<ChannelTestResult> {
  const row = await db.channelConfig.findUnique({ where: { provider } });
  if (!row) throw new ChannelNotConfiguredError();

  const credentials = JSON.parse(decrypt(row.credentials, 'channel.credentials'));
  const result = await resolveAdapter(provider).healthCheck(credentials);
  const reason = result.ok ? null : redactSecrets(result.reason, credentials, resolveDescriptor(provider));

  await db.channelConfig.update({
    where: { provider },
    data: { lastCheckAt: new Date(), lastCheckOk: result.ok, lastError: reason },
  });

  return result.ok ? { ok: true } : { ok: false, reason: reason ?? '' };
}

/**
 * "Usar este canal": passa a ser ele quem envia, a partir do próximo despacho.
 *
 * `isActive` e `isDefault` continuam sendo coisas diferentes no banco — `isDefault`
 * escolhe quem **envia** (um só, garantido por índice único parcial), `isActive`
 * decide de quem o sistema **aceita resposta de entrada** (`app/api/webhooks/*`).
 * O canal anterior segue ativo de propósito: quem responder "PARE" para o número
 * antigo continua sendo marcado como opt-out (T5).
 */
export async function setSendingChannel(provider: ChannelProvider): Promise<void> {
  const row = await db.channelConfig.findUnique({ where: { provider } });
  if (!row) throw new ChannelNotConfiguredError();
  if (row.lastCheckOk !== true) throw new ChannelNotVerifiedError();

  await db.$transaction(async (tx) => {
    await tx.channelConfig.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    await tx.channelConfig.update({ where: { provider }, data: { isActive: true, isDefault: true } });
  });
}

/**
 * Direito de eliminação (LGPD) — apaga o que a mensagem dizia, preserva que ela
 * foi enviada (relatório, auditoria). `PENDING` vira `CANCELLED` primeiro: nada
 * pode sair depois que o cliente pediu eliminação, mesmo que já estivesse na
 * fila — o guard em `messages-dispatch` é a segunda linha de defesa, pro caso
 * de uma linha escapar (mesmo padrão de T5).
 */
export async function scrubCustomerMessages(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.message.updateMany({
    where: { customerId, status: 'PENDING' },
    data: { status: 'CANCELLED', cancelReason: 'customer_anonymized' },
  });
  await tx.message.updateMany({
    where: { customerId },
    data: { body: ANONYMIZED_MESSAGE_BODY, toPhone: '', templateParams: Prisma.DbNull },
  });
}
