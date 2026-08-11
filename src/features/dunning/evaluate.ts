import { db } from '@/lib/db';
import { daysFromDue, consolidate, type PendingStep, type ConsolidatedMessage } from '@/core/dunning-rules';
import { getDefaultRuleWithSteps } from './queries';
import { getSettings, type SettingsDTO } from '@/features/settings/queries';
import { localDateOnly } from '@/core/dates';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { TemplateContext } from '@/core/dunning-template';

type ChargeForStep = {
  id: string;
  customerId: string;
  dueAt: Date;
  principalCents: bigint;
  discountCents: bigint;
  payments: { amountCents: bigint }[];
  customer: { name: string; phone: string | null; optedOut: boolean };
};

type StepForEvaluation = {
  id: string;
  offsetDays: number;
  templateBody: string | null;
};

function buildPendingStep(charge: ChargeForStep, step: StepForEvaluation, settings: SettingsDTO, now: Date): PendingStep {
  const netCents = charge.principalCents - charge.discountCents;
  const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  const remainingCents = netCents - paidCents;

  const context: TemplateContext = {
    'cliente.primeiro_nome': charge.customer.name.split(' ')[0],
    'cliente.nome': charge.customer.name,
    'cobranca.valor': formatCents(remainingCents),
    'cobranca.vencimento': localDateOnly(charge.dueAt, settings.timezone).toLocaleDateString('pt-BR', { timeZone: 'UTC' }),
    'cobranca.dias_atraso': String(Math.max(0, daysFromDue(charge.dueAt, now, settings.timezone))),
    'pix.chave': settings.pixKey ?? '',
    'negocio.nome': settings.businessName,
  };

  return {
    customerId: charge.customerId,
    toPhone: charge.customer.phone as string, // já validado não-nulo antes de chamar
    chargeId: charge.id,
    stepId: step.id,
    offsetDays: step.offsetDays,
    templateBody: step.templateBody ?? '',
    netCents: remainingCents.toString(),
    context,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}

/** Registra um DunningExecution isolado (fora de transação). Falha não derruba a passada — loga e segue. */
async function recordExecution(chargeId: string, stepId: string, outcome: 'PENDING_REVIEW' | 'SKIPPED' | 'QUEUED', reason?: string): Promise<boolean> {
  try {
    await db.dunningExecution.create({ data: { chargeId, stepId, outcome, reason } });
    return true;
  } catch (err) {
    logger.error({ job: 'dunning-evaluate', chargeId, stepId, error: String(err) });
    return false;
  }
}

type PairOutcome =
  | { kind: 'skipped' | 'pendingReview' | 'suspended' }
  | { kind: 'pending'; step: PendingStep }
  | { kind: 'none' };

/** Avalia um par (cobrança, passo): guarda de régua, opt-out, telefone, SUSPEND/NOTIFY_OWNER, ou monta o passo pendente pra consolidação. */
async function evaluateChargeStepPair(
  charge: ChargeForStep & { subscriptionId: string },
  step: StepForEvaluation & { action: string },
  ruleStatus: string,
  settings: SettingsDTO,
  now: Date,
): Promise<PairOutcome> {
  if (ruleStatus === 'REVIEW') {
    const ok = await recordExecution(charge.id, step.id, 'PENDING_REVIEW', 'review');
    return ok ? { kind: 'pendingReview' } : { kind: 'none' };
  }
  if (charge.customer.optedOut) {
    const ok = await recordExecution(charge.id, step.id, 'SKIPPED', 'opted_out');
    return ok ? { kind: 'skipped' } : { kind: 'none' };
  }
  if (!charge.customer.phone) {
    const ok = await recordExecution(charge.id, step.id, 'SKIPPED', 'no_phone');
    return ok ? { kind: 'skipped' } : { kind: 'none' };
  }

  if (step.action === 'SUSPEND') {
    try {
      await db.$transaction(async (tx) => {
        await tx.subscription.update({ where: { id: charge.subscriptionId }, data: { status: 'SUSPENDED' } });
        await tx.dunningExecution.create({ data: { chargeId: charge.id, stepId: step.id, outcome: 'QUEUED' } });
      });
      return { kind: 'suspended' };
    } catch (err) {
      logger.error({ job: 'dunning-evaluate', chargeId: charge.id, stepId: step.id, error: String(err) });
      return { kind: 'none' };
    }
  }

  if (step.action === 'NOTIFY_OWNER') {
    await recordExecution(charge.id, step.id, 'QUEUED');
    return { kind: 'none' };
  }

  return { kind: 'pending', step: buildPendingStep(charge, step, settings, now) };
}

/** Persiste a Message consolidada + os DunningExecution correspondentes numa transação. Retorna quantos passos foram enfileirados. */
async function persistConsolidatedMessage(msg: ConsolidatedMessage, now: Date, timezone: string): Promise<number> {
  try {
    let queued = 0;
    await db.$transaction(async (tx) => {
      const scheduledDate = localDateOnly(now, timezone);
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
      queued = msg.stepIds.length;
    });
    return queued;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // T7: já existe Message DUNNING pro customer hoje — registra o passo como SKIPPED, sem perder o rastro de auditoria.
      try {
        await db.dunningExecution.createMany({
          data: msg.stepIds.map((stepId, i) => ({
            chargeId: msg.chargeIds[i],
            stepId,
            outcome: 'SKIPPED' as const,
            reason: 'daily_dedupe',
          })),
        });
      } catch (dedupeErr) {
        logger.error({ job: 'dunning-evaluate', customerId: msg.customerId, error: String(dedupeErr) });
      }
      return 0;
    }
    logger.error({ job: 'dunning-evaluate', customerId: msg.customerId, error: String(err) });
    return 0;
  }
}

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
    const outcome = await evaluateChargeStepPair(charge, step, rule.status, settings, now);
    if (outcome.kind === 'pending') pending.push(outcome.step);
    else if (outcome.kind === 'skipped') skipped++;
    else if (outcome.kind === 'pendingReview') pendingReview++;
    else if (outcome.kind === 'suspended') suspended++;
  }

  const consolidated = consolidate(pending, settings.timezone);
  let queued = 0;

  for (const msg of consolidated) {
    queued += await persistConsolidatedMessage(msg, now, settings.timezone);
  }

  return { queued, skipped, pendingReview, suspended };
}
