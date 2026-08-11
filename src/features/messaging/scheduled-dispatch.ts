import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { isWithinLocalHourRange, nextQuietHourStart, localDateOnly } from '@/core/dates';
import { resolveAdapter } from './channels/registry';
import type { ChannelAdapter } from './channels/types';
import { logger } from '@/lib/logger';

export type DispatchResult = {
  sent: number;
  failed: number;
  cancelledStale: number;
  cancelledOptedOut: number;
  cancelledPaid: number;
  cancelledDedupe: number;
  rescheduled: number;
};

function emptyResult(): DispatchResult {
  return { sent: 0, failed: 0, cancelledStale: 0, cancelledOptedOut: 0, cancelledPaid: 0, cancelledDedupe: 0, rescheduled: 0 };
}

const BATCH_SIZE = 60;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const OPEN_CHARGE_STATUSES = new Set(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);

type PendingMessage = Prisma.MessageGetPayload<{ include: { customer: { select: { optedOut: true } } } }>;

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}

/** Todas as cobranças ligadas a esta Message (via DunningExecution) já foram pagas/canceladas?
 *  Sem nenhuma ligação (mensagem manual, ou dado inconsistente), não cancela — segue pro envio. */
async function isFullyPaidOrCancelled(messageId: string): Promise<boolean> {
  const executions = await db.dunningExecution.findMany({
    where: { messageId },
    select: { charge: { select: { status: true } } },
  });
  if (executions.length === 0) return false;
  return executions.every((e) => !OPEN_CHARGE_STATUSES.has(e.charge.status));
}

type Outcome = keyof DispatchResult | 'none';

/** Reagenda pra fora da quiet hour (T6), atualizando `scheduledDate` junto — é a coluna que sustenta
 *  o dedupe diário (T7). Se a virada de dia colidir com uma Message já existente pro novo dia, a mensagem
 *  de hoje perde a corrida: cancela com `daily_dedupe` em vez de deixar o erro do banco subir. */
async function rescheduleOutOfQuietHours(
  msg: PendingMessage,
  now: Date,
  settings: { quietHourStart: number; quietHourEnd: number; timezone: string },
): Promise<Outcome> {
  const scheduledFor = nextQuietHourStart(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone);
  const scheduledDate = localDateOnly(scheduledFor, settings.timezone);
  try {
    await db.message.update({ where: { id: msg.id }, data: { scheduledFor, scheduledDate } });
    return 'rescheduled';
  } catch (err) {
    if (isUniqueViolation(err)) {
      await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'daily_dedupe' } });
      return 'cancelledDedupe';
    }
    throw err;
  }
}

async function processMessage(
  msg: PendingMessage,
  now: Date,
  isWithinQuietHours: boolean,
  settings: { quietHourStart: number; quietHourEnd: number; timezone: string },
  channelId: string,
  credentials: unknown,
  adapter: ChannelAdapter,
): Promise<Outcome> {
  if (now.getTime() - msg.createdAt.getTime() > STALE_MS) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'stale' } });
    return 'cancelledStale';
  }

  if (!isWithinQuietHours) {
    return rescheduleOutOfQuietHours(msg, now, settings);
  }

  if (msg.customer.optedOut) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'opted_out' } });
    return 'cancelledOptedOut';
  }

  if (await isFullyPaidOrCancelled(msg.id)) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'charge_closed' } });
    return 'cancelledPaid';
  }

  // Claim atômico: só quem consegue incrementar `attempts` a partir do valor lido pode enviar.
  // Uma segunda execução concorrente (retry do Scheduler, disparo manual, lote lento sobreposto)
  // encontra `attempts` já mudado e `count === 0` — pula sem contar em nenhum contador.
  const claim = await db.message.updateMany({
    where: { id: msg.id, status: 'PENDING', attempts: msg.attempts },
    data: { attempts: msg.attempts + 1 },
  });
  if (claim.count === 0) return 'none';

  const result = await adapter.send({ toPhone: msg.toPhone, body: msg.body }, credentials);
  const attempts = msg.attempts + 1;

  if (result.ok) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'SENT', sentAt: new Date(), externalId: result.externalId, channelId },
    });
    return 'sent';
  }

  if (!result.retryable || attempts >= MAX_ATTEMPTS) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'FAILED', failReason: result.reason, channelId },
    });
    return 'failed';
  }

  // attempts já subiu no claim acima — nada mais a persistir, PENDING segue pra próxima passada.
  return 'none';
}

export async function dispatchPendingMessages(now: Date): Promise<DispatchResult> {
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  if (settings.sendingPaused) return emptyResult();

  const channelRow = await db.channelConfig.findFirst({ where: { isDefault: true, isActive: true } });
  if (!channelRow) {
    logger.warn({ job: 'messages-dispatch', reason: 'no_default_channel' });
    return emptyResult();
  }

  let adapter: ChannelAdapter;
  let credentials: unknown;
  try {
    adapter = resolveAdapter(channelRow.provider);
    credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));
  } catch (err) {
    logger.error({ job: 'messages-dispatch', reason: 'channel_credentials_invalid', error: String(err) });
    return emptyResult();
  }

  const messages = await db.message.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    include: { customer: { select: { optedOut: true } } },
  });

  const result = emptyResult();
  const isWithinQuietHours = isWithinLocalHourRange(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone);

  for (const msg of messages) {
    try {
      const outcome = await processMessage(msg, now, isWithinQuietHours, settings, channelRow.id, credentials, adapter);
      if (outcome !== 'none') result[outcome]++;
    } catch (err) {
      logger.error({ job: 'messages-dispatch', messageId: msg.id, error: String(err) });
    }
  }

  return result;
}
