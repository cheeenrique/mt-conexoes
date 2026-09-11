import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { deriveChargeStatus } from '@/core/billing';
import { nextDueDate, localDateOnly, localDayStartFromIso } from '@/core/dates';
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
export class PaymentDateInFutureError extends DomainError {
  constructor(cause?: unknown) { super('A data do pagamento não pode ser no futuro.', 'PAYMENT_DATE_IN_FUTURE', { cause }); }
}

export async function registerPayment(chargeId: string, input: RegisterPaymentInput) {
  const settings = await getSettings();
  const amountCents = BigInt(input.amountCents);
  const now = new Date();
  const paidAt = localDayStartFromIso(input.paidAt, settings.timezone);

  // O operador registra pagamento com atraso o tempo todo — a data é dele. O
  // que não existe é dinheiro que ainda não entrou: data à frente de hoje no
  // fuso do negócio adiantaria o vencimento do ciclo seguinte.
  if (localDateOnly(paidAt, settings.timezone).getTime() > localDateOnly(now, settings.timezone).getTime()) {
    throw new PaymentDateInFutureError();
  }

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
    const newStatus = deriveChargeStatus({ netCents, paidCents: newPaidCents, dueAt: charge.dueAt, now });

    await tx.charge.update({ where: { id: chargeId }, data: { status: newStatus, paidAt: newStatus === 'PAID' ? paidAt : charge.paidAt } });

    if (newStatus === 'PAID') {
      const newNextDueAt = nextDueDate({ paidAt, cycle: charge.subscription.cycle, timezone: settings.timezone });
      await tx.subscription.update({
        where: { id: charge.subscriptionId },
        data: { nextDueAt: newNextDueAt, ...reactivationPatch(charge.subscription.status) },
      });
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

/**
 * Quitar a cobrança devolve o acesso que a régua cortou. O passo `SUSPEND`
 * (`dunning/evaluate.ts`) é a única coisa que suspende sozinha, e o saldo que
 * motivou o corte acabou de zerar — sem isto o cliente renovado seguia
 * `Suspenso` na lista, fora de todos os degraus da escada de vencimento
 * (`situationWhere` exige assinatura ACTIVE) e fora dos contadores da triagem.
 *
 * `CANCELLED` não volta por aqui: cancelar é decisão do operador e tem outro
 * fluxo (`SubscriptionCancelledError`). Pagamento parcial também não reativa —
 * o acesso volta quando o saldo zera, não quando entra a primeira parcela.
 */
function reactivationPatch(status: string) {
  return status === 'SUSPENDED' ? { status: 'ACTIVE' as const, suspendedAt: null } : {};
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
