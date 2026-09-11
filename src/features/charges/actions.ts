'use server';

import { revalidatePath } from 'next/cache';
import { registerPaymentSchema, cancelChargeSchema } from './schema';
import { registerPayment, cancelCharge, writeOffRemaining, realignChargeToSubscription } from './service';
import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };

export async function registerPaymentAction(chargeId: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = registerPaymentSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await registerPayment(chargeId, parsed.data);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.registerPayment', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

/**
 * "Dar baixa no restante": o que falta vira desconto e a cobrança fecha com o
 * que entrou. Sem corpo para validar — os dois ids vêm da linha da tabela, e o
 * service é quem recusa cobrança paga, cancelada ou sem pagamento nenhum.
 */
export async function writeOffChargeAction(chargeId: string, customerId: string): Promise<ActionResult> {
  try {
    await requireSession();
    await writeOffRemaining(chargeId);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.writeOff', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

/** "Atualizar valor": traz preço, custo e desconto da assinatura para a cobrança em aberto. */
export async function realignChargeAction(chargeId: string, customerId: string): Promise<ActionResult> {
  try {
    await requireSession();
    await realignChargeToSubscription(chargeId);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.realign', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function cancelChargeAction(chargeId: string, customerId: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = cancelChargeSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await cancelCharge(chargeId, parsed.data.reason);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath('/charges');
    revalidatePath('/');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'charges.cancel', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
