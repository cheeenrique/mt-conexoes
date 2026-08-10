import { db } from '@/lib/db';
import { matchOptOutKeyword } from '@/core/opt-out-keywords';
import { localDateOnly } from '@/core/dates';
import { getSettings } from '@/features/settings/queries';

export async function processInboundMessage(input: {
  channelId: string;
  fromPhone: string;
  text: string;
  now: Date;
}): Promise<void> {
  const customer = await db.customer.findUnique({ where: { phone: input.fromPhone } });
  if (!customer) return;

  const settings = await getSettings();
  const scheduledDate = localDateOnly(input.now, settings.timezone);

  await db.message.create({
    data: {
      customerId: customer.id,
      channelId: input.channelId,
      kind: 'INBOUND',
      status: 'RECEIVED',
      toPhone: input.fromPhone,
      body: input.text,
      scheduledFor: input.now,
      scheduledDate,
    },
  });

  const matchedKeyword = matchOptOutKeyword(input.text);
  if (matchedKeyword && !customer.optedOut) {
    await db.customer.update({
      where: { id: customer.id },
      data: { optedOut: true, optedOutAt: input.now, optedOutReason: `Palavra-chave: ${matchedKeyword}` },
    });
  }
}
