import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { recordFinancialEvent } from '@/lib/financial-events';
import { computeChargeDiscount, deriveChargeStatus, isCourtesySubscription } from '@/core/billing';
import { nextDueDate, endOfLocalDay, localDateOnly, localDayStartFromIso } from '@/core/dates';
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
export class ChargeWithoutPaymentError extends DomainError {
  constructor(cause?: unknown) { super('Esta cobrança não tem pagamento registrado — cancele em vez de dar baixa.', 'CHARGE_WITHOUT_PAYMENT', { cause }); }
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

    let paymentId: string;
    try {
      const payment = await tx.payment.create({
        data: { chargeId, amountCents, method: input.method, paidAt, note: input.note || null, idempotencyKey: input.idempotencyKey },
      });
      paymentId = payment.id;
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

    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'PAYMENT',
      entityId: paymentId,
      kind: 'PAYMENT_REGISTERED',
      after: {
        amountCents: amountCents.toString(),
        method: input.method,
        paidAt: paidAt.toISOString(),
        chargeStatus: newStatus,
        note: input.note || null,
      },
    });

    if (newStatus === 'PAID') {
      await openNextCycle(tx, charge, paidAt, settings.timezone, input.nextDueAt || undefined);
    }

    return { chargeId, status: newStatus };
  });
}

/**
 * Dá por encerrada a cobrança que o cliente não vai pagar até o fim: o que
 * falta vira desconto na própria cobrança, e ela fecha com o dinheiro que
 * entrou de verdade.
 *
 * Existe porque nenhum dos dois caminhos que havia servia ao caso real — o
 * cliente de R$ 90 que decidiu ficar no mensal e pagou R$ 30. Cancelar é
 * proibido (tem pagamento registrado) e editar o valor também: documento com
 * dinheiro registrado é imutável. Desconto é a peça que o domínio já tinha
 * para "não vou cobrar isto" sem reescrever o que foi recebido — o faturado
 * cai para o acordado, o recebido não se mexe, o custo segue congelado.
 *
 * Sem pagamento nenhum não é baixa, é cancelamento — e esse caminho já existe,
 * com motivo obrigatório.
 */
export async function writeOffRemaining(chargeId: string): Promise<{ chargeId: string; status: 'PAID' }> {
  const settings = await getSettings();

  return db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true, subscription: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.status === 'PAID') throw new ChargeAlreadyPaidError();
    if (charge.status === 'CANCELLED') throw new ChargeNotFoundError();
    if (charge.payments.length === 0) throw new ChargeWithoutPaymentError();

    const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    // Data do último pagamento: é dela que o ciclo seguinte conta, pela mesma
    // regra do pagamento total (CLAUDE.md §Data e fuso).
    const paidAt = charge.payments.reduce((latest, p) => (p.paidAt > latest ? p.paidAt : latest), charge.payments[0].paidAt);

    await tx.charge.update({
      where: { id: chargeId },
      data: { discountCents: charge.principalCents - paidCents, status: 'PAID', paidAt },
    });

    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_WRITTEN_OFF',
      before: { status: charge.status, discountCents: charge.discountCents.toString() },
      after: { status: 'PAID', discountCents: (charge.principalCents - paidCents).toString() },
    });

    await openNextCycle(tx, charge, paidAt, settings.timezone);

    return { chargeId, status: 'PAID' as const };
  });
}

/**
 * Reemite a cobrança em aberto com o que a assinatura diz hoje: preço, custo e
 * desconto vigente. É a saída para "troquei o plano e a cobrança continua com o
 * valor velho" — é essa cobrança que a régua manda por WhatsApp.
 *
 * Ação explícita, nunca efeito colateral de salvar a ficha: reajuste combinado
 * para o próximo ciclo também mexe em `priceCents`, e ali a cobrança corrente
 * está certa. Só o operador sabe qual dos dois casos é o dele.
 *
 * ⚠️ Recusa cobrança com pagamento registrado (documento com dinheiro não se
 * reescreve — CLAUDE.md §Dinheiro). Nesse caso o caminho é a baixa do restante.
 */
export async function realignChargeToSubscription(chargeId: string): Promise<void> {
  const now = new Date();

  await db.$transaction(async (tx) => {
    const charge = await tx.charge.findUnique({ where: { id: chargeId }, include: { payments: true, subscription: true } });
    if (!charge) throw new ChargeNotFoundError();
    if (charge.status === 'PAID') throw new ChargeAlreadyPaidError();
    if (charge.status === 'CANCELLED') throw new ChargeNotFoundError();
    if (charge.payments.length > 0) throw new ChargeHasPaymentError();

    const discountCents = computeChargeDiscount(charge.subscription, charge.periodStart);

    await tx.charge.update({
      where: { id: chargeId },
      data: {
        principalCents: charge.subscription.priceCents,
        costCents: charge.subscription.costCents,
        discountCents,
        status: deriveChargeStatus({
          netCents: charge.subscription.priceCents - discountCents,
          paidCents: 0n,
          dueAt: charge.dueAt,
          now,
        }),
      },
    });

    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_REALIGNED',
      before: {
        principalCents: charge.principalCents.toString(),
        costCents: charge.costCents.toString(),
        discountCents: charge.discountCents.toString(),
      },
      after: {
        principalCents: charge.subscription.priceCents.toString(),
        costCents: charge.subscription.costCents.toString(),
        discountCents: discountCents.toString(),
      },
    });

    // A régua congela o valor no corpo da mensagem na avaliação e o despacho
    // nunca recalcula (`dunning/message-build.ts`). Sem isto, a cobrança
    // realinhada para R$ 30,00 ainda sairia por R$ 100,00 no WhatsApp horas
    // depois — mesmo motivo de `alignOpenChargeDueAt` cancelar quando o
    // vencimento muda. Mesmo commit: cancelar depois deixa a janela aberta.
    const cancelledMessages = await tx.message.findMany({
      where: { chargeId, status: 'PENDING' },
      select: { id: true },
    });
    await tx.message.updateMany({
      where: { chargeId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelReason: 'amount_changed' },
    });
    // A execução da régua some junto (mesmo motivo do stale T8 em
    // `messaging/scheduled-dispatch.ts`): `DunningExecution` afirma "este
    // passo já foi processado para esta cobrança", e o `UNIQUE(chargeId,
    // stepId)` faz a régua acreditar. Uma mensagem cancelada aqui nunca
    // chegou a sair pelo WhatsApp — o passo foi planejado, não executado.
    // Deixar a linha em pé bloqueia a reavaliação daquele par para sempre.
    if (cancelledMessages.length > 0) {
      await tx.dunningExecution.deleteMany({
        where: { messageId: { in: cancelledMessages.map((m) => m.id) } },
      });
    }
  });
}

/** `YYYY-MM-DD` local vira 23:59:59.999 daquele dia, que é como todo vencimento é gravado. */
function localDateStringToEndOfDay(dateStr: string, timezone: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return endOfLocalDay(year, month - 1, day, timezone);
}

type ChargeWithSubscription = Prisma.ChargeGetPayload<{ include: { subscription: true } }>;

/**
 * Cobrança quitada fecha o ciclo e abre o próximo — o segundo dos dois únicos
 * momentos em que uma `Charge` nasce (CLAUDE.md §Data e fuso). Compartilhado
 * entre o pagamento total e a baixa do restante: duplicar cálculo de
 * vencimento entre dois caminhos é divergência de valor garantida
 * (`.claude/rules/05-reuso.md`).
 */
async function openNextCycle(
  tx: Prisma.TransactionClient,
  charge: ChargeWithSubscription,
  paidAt: Date,
  timezone: string,
  /** `YYYY-MM-DD` escolhido pelo operador no diálogo. Ausente = vale a regra. */
  overrideDueAt?: string,
): Promise<void> {
  const newNextDueAt = overrideDueAt
    ? localDateStringToEndOfDay(overrideDueAt, timezone)
    : nextDueDate({ paidAt, currentDueAt: charge.dueAt, cycle: charge.subscription.cycle, timezone });

  await tx.subscription.update({
    where: { id: charge.subscriptionId },
    data: { nextDueAt: newNextDueAt, ...reactivationPatch(charge.subscription.status) },
  });
  // Cortesia avança o vencimento (o acesso continua tendo validade) e não abre
  // cobrança nova — ver `isCourtesySubscription`. Chegar aqui com preço zero é raro
  // (exige cobrança antiga de antes da regra sendo quitada agora), mas quitar uma
  // dessas não pode ressuscitar o ciclo de cobrança que a cortesia não tem.
  if (isCourtesySubscription(charge.subscription)) return;
  await tx.charge.create({
    data: {
      subscriptionId: charge.subscriptionId,
      customerId: charge.customerId,
      supplierId: charge.supplierId,
      principalCents: charge.subscription.priceCents,
      discountCents: 0n,
      costCents: charge.subscription.costCents,
      periodStart: charge.periodEnd,
      periodEnd: localDateOnly(newNextDueAt, timezone),
      dueAt: newNextDueAt,
    },
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

    await recordFinancialEvent(tx, {
      customerId: charge.customerId,
      entityType: 'CHARGE',
      entityId: chargeId,
      kind: 'CHARGE_CANCELLED',
      before: { status: charge.status },
      after: { status: 'CANCELLED' },
      reason,
    });
  });
}

function isUniqueViolation(err: unknown, field: string): boolean {
  return !!err && typeof err === 'object' && 'code' in err && err.code === 'P2002' && 'meta' in err &&
    !!err.meta && typeof err.meta === 'object' && 'target' in err.meta &&
    Array.isArray(err.meta.target) && err.meta.target.includes(field);
}
