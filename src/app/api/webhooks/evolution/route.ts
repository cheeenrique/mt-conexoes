import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { resolveAdapter } from '@/features/messaging/channels/registry';
import { processInboundMessage } from '@/features/messaging/inbound';
import { logger } from '@/lib/logger';

export async function POST(req: Request): Promise<Response> {
  try {
    const rawBody = await req.text();
    // Sem filtro por `isActive`: um canal recém-pareado ainda não está ativo, e é
    // justamente o `connection.update` deste webhook que fecha o laço "pareou → conectado".
    // Resposta de entrada continua exigindo canal ativo — ver abaixo.
    const channelRow = await db.channelConfig.findUnique({ where: { provider: 'EVOLUTION' } });
    if (!channelRow) return new Response(null, { status: 404 });

    const adapter = resolveAdapter('EVOLUTION');
    const credentials = JSON.parse(decrypt(channelRow.credentials, 'channel.credentials'));

    if (!adapter.verifyWebhookSignature(rawBody, req.headers, credentials)) {
      return new Response(null, { status: 401 });
    }

    const connectionEvent = adapter.parseConnectionEvent?.(rawBody);
    if (connectionEvent) {
      // `'connecting'` é reconexão automática em andamento — nem queda nem volta
      // confirmada, não mexe em `disconnectedAt`. Só `open`/`close` são terminais.
      if (connectionEvent.state === 'open') {
        // Sessão aberta é o mesmo `state: 'open'` que `healthCheck()` confere: o canal
        // passa a testado, e é isso que libera "Usar este canal". O número remetente vem
        // do `wuid` que o próprio aparelho reporta, não de um campo digitado.
        await db.channelConfig.update({
          where: { id: channelRow.id },
          data: {
            disconnectedAt: null,
            lastCheckAt: new Date(),
            lastCheckOk: true,
            lastError: null,
            ...(connectionEvent.phone ? { phoneNumber: connectionEvent.phone } : {}),
          },
        });
      } else if (connectionEvent.state === 'close') {
        await db.channelConfig.update({ where: { id: channelRow.id }, data: { disconnectedAt: new Date() } });
      }
      return Response.json({ ok: true });
    }

    // Opt-out (T5) só vale para o canal que o operador mantém ativo.
    if (!channelRow.isActive) return Response.json({ ok: true });

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
