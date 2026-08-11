import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { resolveAdapter } from '@/features/messaging/channels/registry';
import { processInboundMessage } from '@/features/messaging/inbound';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  try {
    const rawBody = await req.text();
    const channelRow = await db.channelConfig.findFirst({ where: { provider: 'EVOLUTION', isActive: true } });
    if (!channelRow) return new Response(null, { status: 404 });

    const adapter = resolveAdapter('EVOLUTION');
    const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

    if (!adapter.verifyWebhookSignature(rawBody, req.headers, credentials)) {
      return new Response(null, { status: 401 });
    }

    const messages = adapter.parseInboundWebhook(rawBody);
    if (!messages) return Response.json({ ok: true });

    for (const msg of messages) {
      try {
        await processInboundMessage({ channelId: channelRow.id, fromPhone: msg.fromPhone, text: msg.text, now: new Date() });
      } catch (err) {
        logger.error({ route: 'webhooks.evolution', error: String(err), stack: err instanceof Error ? err.stack : undefined });
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    logger.error({ route: 'webhooks.evolution', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return new Response(null, { status: 500 });
  }
}
