import { db } from '@/lib/db';
import { daysFromDue, consolidate, type PendingStep } from '@/core/dunning-rules';
import { getDefaultRuleWithSteps } from './queries';
import { getSettings } from '@/features/settings/queries';
import { localDateOnly } from '@/core/dates';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { TemplateContext } from '@/core/dunning-template';

export async function evaluateDunningRule(now: Date): Promise<{
  queued: number; skipped: number; pendingReview: number; suspended: number;
}> {
  const rule = await getDefaultRuleWithSteps();
  const settings = await getSettings();
  const activeSteps = rule.steps.filter((s) => s.isActive);

  const charges = await db.charge.findMany({
    where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    include: { customer: true, payments: { select: { amountCents: true } } },
  });

  const chargeStepPairs = charges.flatMap((charge) =>
    activeSteps
      .filter((step) => daysFromDue(charge.dueAt, now, settings.timezone) === step.offsetDays)
      .map((step) => ({ charge, step })),
  );

  if (chargeStepPairs.length === 0) return { queued: 0, skipped: 0, pendingReview: 0, suspended: 0 };

  const existing = await db.dunningExecution.findMany({
    where: { OR: chargeStepPairs.map(({ charge, step }) => ({ chargeId: charge.id, stepId: step.id })) },
    select: { chargeId: true, stepId: true },
  });
  const existingKeys = new Set(existing.map((e) => `${e.chargeId}:${e.stepId}`));
  const newPairs = chargeStepPairs.filter(({ charge, step }) => !existingKeys.has(`${charge.id}:${step.id}`));

  let skipped = 0;
  let pendingReview = 0;
  let suspended = 0;
  const pending: PendingStep[] = [];

  for (const { charge, step } of newPairs) {
    if (rule.status === 'REVIEW') {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'PENDING_REVIEW', reason: 'review' } });
      pendingReview++;
      continue;
    }

    if (charge.customer.optedOut) {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'SKIPPED', reason: 'opted_out' } });
      skipped++;
      continue;
    }
    if (!charge.customer.phone) {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'SKIPPED', reason: 'no_phone' } });
      skipped++;
      continue;
    }

    if (step.action === 'SUSPEND') {
      try {
        await db.$transaction(async (tx) => {
          await tx.subscription.update({ where: { id: charge.subscriptionId }, data: { status: 'SUSPENDED' } });
          await tx.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED' } });
        });
        suspended++;
      } catch (err) {
        logger.error({ job: 'dunning-evaluate', chargeId: charge.id, stepId: step.id, error: String(err) });
      }
      continue;
    }

    if (step.action === 'NOTIFY_OWNER') {
      await db.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED' } });
      continue;
    }

    const netCents = charge.principalCents - charge.discountCents;
    const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    const context: TemplateContext = {
      'cliente.primeiro_nome': charge.customer.name.split(' ')[0],
      'cliente.nome': charge.customer.name,
      'cobranca.valor': (Number(netCents - paidCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      'cobranca.vencimento': localDateOnly(charge.dueAt, settings.timezone).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
      'cobranca.dias_atraso': String(Math.max(0, daysFromDue(charge.dueAt, now, settings.timezone))),
      'pix.chave': settings.pixKey ?? '',
      'negocio.nome': settings.businessName,
    };

    pending.push({
      customerId: charge.customerId,
      toPhone: charge.customer.phone, // já validado não-nulo acima (checagem "sem telefone")
      chargeId: charge.id,
      stepId: step.id,
      offsetDays: step.offsetDays,
      templateBody: step.templateBody ?? '',
      netCents: (netCents - paidCents).toString(),
      context,
    });
  }

  const consolidated = consolidate(pending, settings.timezone);
  let queued = 0;

  for (const msg of consolidated) {
    try {
      await db.$transaction(async (tx) => {
        const scheduledDate = localDateOnly(now, settings.timezone);
        const body = msg.extraCount > 0
          ? `${msg.body}\n\n+ mais ${msg.extraCount} cobrança(s), totalizando ${formatCents(msg.extraCents)}`
          : msg.body;
        const created = await tx.message.create({
          data: {
            customerId: msg.customerId,
            kind: 'DUNNING',
            status: 'PENDING',
            toPhone: msg.toPhone,
            body,
            scheduledFor: now,
            scheduledDate,
          },
        });
        for (let i = 0; i < msg.stepIds.length; i++) {
          await tx.dunningExecution.create({
            data: { chargeId: msg.chargeIds[i], stepId: msg.stepIds[i], outcome: 'QUEUED', messageId: created.id },
          });
        }
        queued += msg.stepIds.length;
      });
    } catch (err) {
      logger.error({ job: 'dunning-evaluate', customerId: msg.customerId, error: String(err) });
    }
  }

  return { queued, skipped, pendingReview, suspended };
}
