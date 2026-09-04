import { db } from '@/lib/db';
import { matchOptOutKeyword } from '@/core/opt-out-keywords';
import { localDateOnly } from '@/core/dates';
import { toE164 } from '@/core/phone';
import { getSettings } from '@/lib/settings';

export async function processInboundMessage(input: {
  channelId: string;
  fromPhone: string;
  text: string;
  now: Date;
}): Promise<void> {
  // Adapters de webhook (Meta, Evolution) entregam o telefone sem "+"; Customer.phone é E.164 com "+".
  const fromPhone = toE164(input.fromPhone);
  // `Customer.phone` não é `@@unique` (migration 00000000000020) — duas
  // pessoas cobradas separadamente podem dividir um WhatsApp. T5 tem que
  // valer pro número, não só pro primeiro Customer encontrado: quem manda
  // "SAIR" não pode seguir recebendo cobrança pelo cadastro-irmão que usa o
  // mesmo telefone.
  const customers = await db.customer.findMany({ where: { phone: fromPhone } });
  if (customers.length === 0) return;

  const settings = await getSettings();
  const scheduledDate = localDateOnly(input.now, settings.timezone);

  const matchedKeyword = matchOptOutKeyword(input.text);

  await db.$transaction(async (tx) => {
    for (const customer of customers) {
      await tx.message.create({
        data: {
          customerId: customer.id,
          channelId: input.channelId,
          kind: 'INBOUND',
          status: 'RECEIVED',
          toPhone: fromPhone,
          body: input.text,
          scheduledFor: input.now,
          scheduledDate,
        },
      });

      if (matchedKeyword && !customer.optedOut) {
        await tx.customer.update({
          where: { id: customer.id },
          data: { optedOut: true, optedOutAt: input.now, optedOutReason: `Palavra-chave: ${matchedKeyword}` },
        });
      }
    }
  });
}
