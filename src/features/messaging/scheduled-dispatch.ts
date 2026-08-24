import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { isWithinLocalHourRange, nextQuietHourStart, localDateOnly } from '@/core/dates';
import { dispatchBatchSize, sendDelayMs } from '@/core/send-throttle';
import { CHANNEL_PROVIDERS, resolveAdapter } from './channels/registry';
import { refreshChannelHealth } from './channel-health';
import type { ChannelAdapter } from './channels/types';
import { logger } from '@/lib/logger';

/** Espera real entre envios — o teste injeta uma função instantânea no lugar. */
function realWait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
   *  cuida do resto). Sem isso a queda vira "envios pausados" invisível na tela. */
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

/** `calledProvider` distingue quem tocou a rede de quem só mudou de status no
 *  banco (stale, reagendado, opt-out, pago, canal caído, corrida perdida) — é
 *  o que decide se o jitter de `sendDelayMs` entra antes da próxima mensagem. */
type ProcessOutcome = { outcome: Outcome; calledProvider: boolean };

async function processMessage(
  msg: PendingMessage,
  now: Date,
  isWithinQuietHours: boolean,
  settings: { quietHourStart: number; quietHourEnd: number; timezone: string },
  channelId: string,
  credentials: unknown,
  adapter: ChannelAdapter,
  channelHealthy: boolean,
): Promise<ProcessOutcome> {
  if (now.getTime() - msg.createdAt.getTime() > STALE_MS) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'stale' } });
    return { outcome: 'cancelledStale', calledProvider: false };
  }

  if (!isWithinQuietHours) {
    const outcome = await rescheduleOutOfQuietHours(msg, now, settings);
    return { outcome, calledProvider: false };
  }

  if (msg.customer.optedOut) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'opted_out' } });
    return { outcome: 'cancelledOptedOut', calledProvider: false };
  }

  if (await isFullyPaidOrCancelled(msg.id)) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'CANCELLED', cancelReason: 'charge_closed' } });
    return { outcome: 'cancelledPaid', calledProvider: false };
  }

  // Canal fora do ar: não tenta enviar e não queima a mensagem em FAILED — fica PENDING,
  // recuperável se o operador reparear em até 24h (depois disso o check de `stale` acima,
  // na próxima passada, cuida do resto). Roda depois de stale/quiet-hour/opt-out/pago:
  // esses continuam valendo mesmo com o canal caído.
  if (!channelHealthy) return { outcome: 'blockedChannelDown', calledProvider: false };

  // Corpo maior que o teto do provider (`maxBodyLength`): falha aqui, explícita, em vez
  // de mandar pro provider e deixar ele rejeitar ou truncar em silêncio. Não conta como
  // tentativa contra o provider — não há claim nem chamada de rede.
  if (msg.body.length > adapter.capabilities.maxBodyLength) {
    await db.message.update({ where: { id: msg.id }, data: { status: 'FAILED', failReason: 'body_too_long', channelId } });
    return { outcome: 'failed', calledProvider: false };
  }

  // Claim atômico: só quem consegue incrementar `attempts` a partir do valor lido pode enviar.
  // Uma segunda execução concorrente (retry do Scheduler, disparo manual, lote lento sobreposto)
  // encontra `attempts` já mudado e `count === 0` — pula sem contar em nenhum contador.
  const claim = await db.message.updateMany({
    where: { id: msg.id, status: 'PENDING', attempts: msg.attempts },
    data: { attempts: msg.attempts + 1 },
  });
  if (claim.count === 0) return { outcome: 'none', calledProvider: false };

  // `templateRef` só existe quando a Message foi congelada com template na avaliação
  // (`dunning/evaluate.ts`) — canal de texto livre (Evolution) nunca grava
  // `templateName`, e o adapter ignora `templateRef` quando não sabe o que fazer com
  // ele. Nenhum `if (provider === ...)` aqui: quem decide usar ou ignorar é o adapter.
  const templateRef = msg.templateName
    ? { name: msg.templateName, params: (msg.templateParams as Record<string, string> | null) ?? undefined }
    : undefined;
  const result = await adapter.send({ toPhone: msg.toPhone, body: msg.body, templateRef }, credentials);
  const attempts = msg.attempts + 1;

  if (result.ok) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'SENT', sentAt: new Date(), externalId: result.externalId, channelId },
    });
    return { outcome: 'sent', calledProvider: true };
  }

  if (!result.retryable || attempts >= MAX_ATTEMPTS) {
    await db.message.update({
      where: { id: msg.id },
      data: { status: 'FAILED', failReason: result.reason, channelId },
    });
    return { outcome: 'failed', calledProvider: true };
  }

  // attempts já subiu no claim acima — nada mais a persistir, PENDING segue pra próxima passada.
  return { outcome: 'none', calledProvider: true };
}

/** `random`/`wait` injetados como `now`: produção usa `Math.random` e o relógio
 *  de verdade, o teste passa algo determinístico e instantâneo. */
export async function dispatchPendingMessages(
  now: Date,
  random: () => number = Math.random,
  wait: (ms: number) => Promise<void> = realWait,
): Promise<DispatchResult> {
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
  const rateLimitPerMinute = adapter.capabilities.rateLimitPerMinute;

  const messages = await db.message.findMany({
    where: { status: 'PENDING', scheduledFor: { lte: now } },
    orderBy: { createdAt: 'asc' },
    take: dispatchBatchSize(rateLimitPerMinute),
    include: { customer: { select: { optedOut: true } } },
  });

  const result = emptyResult();
  const isWithinQuietHours = isWithinLocalHourRange(now, settings.quietHourStart, settings.quietHourEnd, settings.timezone);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    try {
      const { outcome, calledProvider } = await processMessage(msg, now, isWithinQuietHours, settings, channelRow.id, credentials, adapter, channelHealthy);
      if (outcome !== 'none') result[outcome]++;
      // Jitter só entre chamadas reais ao provider, e só se sobrar mensagem depois
      // desta — cancelar, reagendar ou pular por canal caído não toca a rede, e
      // atrasar a última mensagem do lote só deixaria a passada mais lenta à toa.
      if (calledProvider && i < messages.length - 1) await wait(sendDelayMs(rateLimitPerMinute, random));
    } catch (err) {
      logger.error({ job: 'messages-dispatch', messageId: msg.id, error: String(err) });
    }
  }

  if (result.blockedChannelDown > 0) {
    logger.warn({ job: 'messages-dispatch', reason: 'channel_down', channelId: channelRow.id, blockedChannelDown: result.blockedChannelDown });
  }

  return result;
}
