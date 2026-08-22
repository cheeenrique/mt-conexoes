import type { ChannelConfig, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { isWithinLocalHourRange, nextQuietHourStart, localDateOnly } from '@/core/dates';
import { CHANNEL_PROVIDERS, resolveAdapter, resolveDescriptor } from './channels/registry';
import { redactSecrets } from './channels/redact';
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
  /** Canal padrão fora do ar (`lastCheckOk === false`): mensagem não foi tentada e
   *  continua PENDING, recuperável se o operador reparear o canal em até 24h (T8 `stale`
   *  cuida do resto). Sem isso a queda vira "envios pausados" invisível na tela — ver
   *  antipadrão registrado sobre `scheduled-dispatch.ts:131`. */
  blockedChannelDown: number;
};

function emptyResult(): DispatchResult {
  return {
    sent: 0,
    failed: 0,
    cancelledStale: 0,
    cancelledOptedOut: 0,
    cancelledPaid: 0,
    cancelledDedupe: 0,
    rescheduled: 0,
    blockedChannelDown: 0,
  };
}

const BATCH_SIZE = 60;
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const OPEN_CHARGE_STATUSES = new Set(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);
// Mesma cadência do próprio job (`messages-dispatch`, a cada 15 min entre 08h-20h) —
// não é um cron novo, é um GET na frente da passada existente. Cobre o caso que
// `connection.update` estruturalmente não reporta: a VPS/instância inteira fora do ar.
const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;

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

/**
 * Reconfere a saúde do canal padrão no máximo uma vez por `HEALTH_CHECK_INTERVAL_MS`.
 * `connection.update` cobre a sessão do WhatsApp cair; isto cobre a VPS inteira cair,
 * que não emite webhook nenhum. Persiste em `lastCheckAt/lastCheckOk/lastError` — a
 * mesma tripla que a tela de Canais e o teste manual (`service.ts`) já leem.
 */
async function refreshChannelHealth(channelRow: ChannelConfig, adapter: ChannelAdapter, credentials: unknown, now: Date): Promise<boolean> {
  const dueForCheck = !channelRow.lastCheckAt || now.getTime() - channelRow.lastCheckAt.getTime() >= HEALTH_CHECK_INTERVAL_MS;
  if (!dueForCheck) return channelRow.lastCheckOk === true;

  const result = await adapter.healthCheck(credentials);
  const reason = result.ok ? null : redactSecrets(result.reason, credentials, resolveDescriptor(channelRow.provider));
  await db.channelConfig.update({
    where: { id: channelRow.id },
    data: { lastCheckAt: now, lastCheckOk: result.ok, lastError: reason },
  });
  return result.ok;
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
  channelHealthy: boolean,
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

  // Canal fora do ar: não tenta enviar e não queima a mensagem em FAILED — fica PENDING,
  // recuperável se o operador reparear em até 24h (depois disso o check de `stale` acima,
  // na próxima passada, cuida do resto). Roda depois de stale/quiet-hour/opt-out/pago:
  // esses continuam valendo mesmo com o canal caído.
  if (!channelHealthy) return 'blockedChannelDown';

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

  const channelRow = await db.channelConfig.findFirst({
    // `SALVY` continua no enum do Postgres sem adapter — linha antiga marcada como padrão
    // não pode entrar no despacho.
    where: { isDefault: true, isActive: true, provider: { in: CHANNEL_PROVIDERS } },
  });
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

  const channelHealthy = await refreshChannelHealth(channelRow, adapter, credentials, now);

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
      const outcome = await processMessage(msg, now, isWithinQuietHours, settings, channelRow.id, credentials, adapter, channelHealthy);
      if (outcome !== 'none') result[outcome]++;
    } catch (err) {
      logger.error({ job: 'messages-dispatch', messageId: msg.id, error: String(err) });
    }
  }

  if (result.blockedChannelDown > 0) {
    logger.warn({ job: 'messages-dispatch', reason: 'channel_down', channelId: channelRow.id, blockedChannelDown: result.blockedChannelDown });
  }

  return result;
}
