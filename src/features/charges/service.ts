import { TZDate } from '@date-fns/tz';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { deriveChargeStatus } from '@/core/billing';
import { nextDueDate, localDateOnly } from '@/core/dates';
import { getSettings } from '@/lib/settings';
import type { z } from 'zod';
import type { registerPaymentSchema } from './schema';

type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

export class ChargeNotFoundError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança não encontrada.', 'CHARGE_NOT_FOUND', { cause }); }
}
export class ChargeAlreadyPaidError extends DomainError {
  constructor(cause?: unknown) { super('Esta cobrança já foi paga.', 'CHARGE_ALREADY_PAID', { cause }); }
}
export class PaymentExceedsBalanceError extends DomainError {
  constructor(cause?: unknown) { super('Valor do pagamento é maior que o saldo devedor.', 'PAYMENT_EXCEEDS_BALANCE', { cause }); }
}
export class ChargeHasPaymentError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança com pagamento registrado não pode ser cancelada.', 'CHARGE_HAS_PAYMENT', { cause }); }
}

// 'YYYY-MM-DD' vira meia-noite local convertida para UTC — não passar pelo
// meio-dia UTC seguido de localDateOnly: nesse caminho, meia-noite UTC do
// dia informado já cai no dia anterior em fusos negativos (America/Sao_Paulo,
// UTC-3), e localDateOnly reconfirma esse dia errado. O resultado é o dia do
// mês usado por nextDueDate saindo um dia adiantado do que o operador digitou
// — exatamente o tipo de desvio que o clamp de fim de mês do CLAUDE.md cobre.
function paidAtLocal(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day || Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    throw new Error('Data do pagamento em formato inválido.');
  }
  const local = new TZDate(year, month - 1, day, 0, 0, 0, 0, timezone);
  return new Date(local.getTime());
}

export async function registerPayment(chargeId: string, input: RegisterPaymentInput) {
  const settings = await getSettings();
  const amountCents = BigInt(input.amountCents);
  const paidAt = paidAtLocal(input.paidAt, settings.timezone);

  return db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true, subscription: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.status === 'PAID') throw new ChargeAlreadyPaidError();
    if (charge.status === 'CANCELLED') throw new ChargeNotFoundError();

    const netCents = charge.principalCents - charge.discountCents;
    const paidSoFar = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    if (paidSoFar + amountCents > netCents) throw new PaymentExceedsBalanceError();

    try {
      await tx.payment.create({
        data: { chargeId, amountCents, method: input.method, paidAt, note: input.note || null, idempotencyKey: input.idempotencyKey },
      });
    } catch (err) {
      // Segunda tentativa com a mesma idempotencyKey — unique constraint recusa,
      // trata como sucesso silencioso (a primeira já aplicou o pagamento).
      if (isUniqueViolation(err, 'idempotencyKey')) {
        return { chargeId, status: charge.status };
      }
      throw err;
    }

    const newPaidCents = paidSoFar + amountCents;
    const newStatus = deriveChargeStatus({ netCents, paidCents: newPaidCents, dueAt: charge.dueAt, now: new Date() });

    await tx.charge.update({ where: { id: chargeId }, data: { status: newStatus, paidAt: newStatus === 'PAID' ? paidAt : charge.paidAt } });

    if (newStatus === 'PAID') {
      const newNextDueAt = nextDueDate({ paidAt, cycle: charge.subscription.cycle, timezone: settings.timezone });
      await tx.subscription.update({ where: { id: charge.subscriptionId }, data: { nextDueAt: newNextDueAt } });
      await tx.charge.create({
        data: {
          subscriptionId: charge.subscriptionId,
          customerId: charge.customerId,
          supplierId: charge.supplierId,
          principalCents: charge.subscription.priceCents,
          discountCents: 0n,
          costCents: charge.subscription.costCents,
          periodStart: charge.periodEnd,
          periodEnd: localDateOnly(newNextDueAt, settings.timezone),
          dueAt: newNextDueAt,
        },
      });
    }

    return { chargeId, status: newStatus };
  });
}

export async function cancelCharge(chargeId: string, reason: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.payments.length > 0) throw new ChargeHasPaymentError();

    await tx.charge.update({ where: { id: chargeId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason } });
  });
}

function isUniqueViolation(err: unknown, field: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 'P2002' && 'meta' in err &&
    !!err.meta && typeof err.meta === 'object' && 'target' in err.meta &&
    Array.isArray(err.meta.target) && err.meta.target.includes(field);
}
