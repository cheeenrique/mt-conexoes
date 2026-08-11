import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { isWithinLocalHourRange, nextQuietHourStart } from '@/core/dates';
import { resolveAdapter } from './channels/registry';
import type { ChannelAdapter } from './channels/types';
import { logger } from '@/lib/logger';

export type DispatchResult = {
  sent: number;
  failed: number;
  cancelledStale: number;
  cancelledOptedOut: number;
  cancelledPaid: number;
  rescheduled: number;
};

function emptyResult(): DispatchResult {
  return { sent: 0, failed: 0, cancelledStale: 0, cancelledOptedOut: 0, cancelledPaid: 0, rescheduled: 0 };
}

const BATCH_SIZE = 60;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const OPEN_CHARGE_STATUSES = new Set(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);

type PendingMessage = Prisma.MessageGetPayload<{ include: { customer: { select: { optedOut: true } } } }>;

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

async function processMessage(
  msg: PendingMessage,
  now: Date,
  settings: { quietHourStart: number; quietHourEnd: number; timezone: string },
  channelId: string,
  credentials: unknown,
  adapter: ChannelAdapter,
): Promise<Outcome> {
  if (now.getTime() - msg.createdAt.getTime() > STALE_MS) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'stale' } });
    return 'cancelledStale';
  }

  if (!isWithinLocalHourRange(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone)) {
    const scheduledFor = nextQuietHourStart(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone);
    await db.message.update({ where: { id: msg.id }, data: { scheduledFor } });
    return 'rescheduled';
  }

  if (msg.customer.optedOut) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'opted_out' } });
    return 'cancelledOptedOut';
  }

  if (await isFullyPaidOrCancelled(msg.id)) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'charge_closed' } });
    return 'cancelledPaid';
  }

  const result = await adapter.send({ toPhone: msg.toPhone, body: msg.body }, credentials);
  const attempts = msg.attempts + 1;

  if (result.ok) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'SENT', sentAt: now, externalId: result.externalId, channelId, attempts },
    });
    return 'sent';
  }

  if (!result.retryable || attempts >= MAX_ATTEMPTS) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'FAILED', failReason: result.reason, attempts, channelId },
    });
    return 'failed';
  }

  await db.message.update({ where: { id: msg.id }, data: { attempts } });
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

  for (const msg of messages) {
    try {
      const outcome = await processMessage(msg, now, settings, channelRow.id, credentials, adapter);
      if (outcome !== 'none') result[outcome]++;
    } catch (err) {
      logger.error({ job: 'messages-dispatch', messageId: msg.id, error: String(err) });
    }
  }

  return result;
}
