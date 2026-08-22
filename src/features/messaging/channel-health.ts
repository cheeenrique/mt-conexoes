import type { ChannelConfig } from '@prisma/client';
import { db } from '@/lib/db';
import { redactSecrets } from './channels/redact';
import { resolveDescriptor } from './channels/registry';
import type { ChannelAdapter } from './channels/types';

// Mesma cadência do próprio job (`messages-dispatch`, a cada 15 min entre 08h-20h) —
// não é um cron novo, é um GET na frente da passada existente. Cobre o caso que
// `connection.update` estruturalmente não reporta: a VPS/instância inteira fora do ar.
const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Reconfere a saúde do canal padrão no máximo uma vez por `HEALTH_CHECK_INTERVAL_MS`.
 * `connection.update` cobre a sessão do WhatsApp cair; isto cobre a VPS inteira cair,
 * que não emite webhook nenhum. Persiste em `lastCheckAt/lastCheckOk/lastError` — a
 * mesma tripla que a tela de Canais e o teste manual (`service.ts`) já leem.
 */
export async function refreshChannelHealth(channelRow: ChannelConfig, adapter: ChannelAdapter, credentials: unknown, now: Date): Promise<boolean> {
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
