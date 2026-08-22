import { db } from '@/lib/db';
import { consolidate, daysFromDue, type PendingStep, type ConsolidatedMessage } from '@/core/dunning-rules';
import { buildConsolidatedBody, buildPendingStep, type ChargeForStep, type StepForEvaluation } from './message-build';
import { getDefaultRuleWithSteps } from './queries';
import { getSettings, type SettingsDTO } from '@/lib/settings';
import { localDateOnly } from '@/core/dates';
import { logger } from '@/lib/logger';

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

/** Avalia um par (cobrança, passo): guarda de régua, template aprovado, opt-out, telefone, SUSPEND/NOTIFY_OWNER, ou monta o passo pendente pra consolidação. */
async function evaluateChargeStepPair(
  charge: ChargeForStep & { subscriptionId: string },
  step: StepForEvaluation & { action: string; metaTemplateName: string | null },
  ruleStatus: string,
  requiresApprovedTemplate: boolean,
  settings: SettingsDTO,
  now: Date,
): Promise<PairOutcome> {
  if (ruleStatus === 'REVIEW') {
    const ok = await recordExecution(charge.id, step.id, 'PENDING_REVIEW', 'review');
    return ok ? { kind: 'pendingReview' } : { kind: 'none' };
  }
  // Canal padrão só entrega template aprovado (Meta, fora da janela de 24h) e este
  // passo ainda não tem um modelado: falha aqui, explícita, em vez de tentar texto
  // livre que a Meta recusa — ver CLAUDE.md §Providers de WhatsApp.
  if (step.action === 'SEND_MESSAGE' && requiresApprovedTemplate && !step.metaTemplateName) {
    const ok = await recordExecution(charge.id, step.id, 'SKIPPED', 'template_not_approved');
    return ok ? { kind: 'skipped' } : { kind: 'none' };
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

/**
 * Grava o carimbo da passada na régua — só chega aqui se `evaluateDunningRule`
 * rodou até o fim (o `await` está no último passo da função). Uma exceção no
 * meio da avaliação propaga antes de tocar esta linha, então o carimbo nunca
 * afirma sucesso para uma passada que falhou. Roda mesmo com zero pares
 * (cobrança, passo) hoje — é o que distingue "motor rodou e não achou nada"
 * de "motor parou", para quem olha a tela.
 */
async function recordRuleRun(ruleId: string, now: Date, counts: { messagesSent: number; pendingReview: number }): Promise<void> {
  try {
    await db.dunningRule.update({
      where: { id: ruleId },
      data: { lastRunAt: now, lastRunMessagesSent: counts.messagesSent, lastRunPendingReview: counts.pendingReview },
    });
  } catch (err) {
    logger.error({ job: 'dunning-evaluate', ruleId, error: String(err) });
  }
}

/** Persiste a Message consolidada + os DunningExecution correspondentes numa transação. Retorna quantos passos foram enfileirados. */
async function persistConsolidatedMessage(msg: ConsolidatedMessage, now: Date, timezone: string): Promise<number> {
  try {
    let queued = 0;
    await db.$transaction(async (tx) => {
      const scheduledDate = localDateOnly(now, timezone);
      const body = buildConsolidatedBody(msg);
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

const EMPTY_EVALUATION_RESULT = { queued: 0, skipped: 0, pendingReview: 0, suspended: 0 } as const;

/**
 * `requiresApprovedTemplate` entra por parâmetro, resolvido pelo chamador
 * (`app/api/cron/dunning-evaluate/route.ts`) — `dunning` não importa de
 * `messaging` (.claude/rules/01-arquitetura.md), quem cruza as duas features
 * é a rota, igual `page.tsx` já faz pro lado da tela (`ChannelNote`).
 */
export async function evaluateDunningRule(now: Date, requiresApprovedTemplate: boolean): Promise<{
  queued: number; skipped: number; pendingReview: number; suspended: number;
}> {
  const rule = await getDefaultRuleWithSteps();
  // DRAFT: "o motor nem avalia esta régua". PAUSED: "nada sai por esta régua".
  // Só REVIEW (calcula sem enviar) e ACTIVE (roda) chegam a avaliar cobrança.
  if (rule.status !== 'REVIEW' && rule.status !== 'ACTIVE') {
    return { ...EMPTY_EVALUATION_RESULT };
  }

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

  if (chargeStepPairs.length === 0) {
    await recordRuleRun(rule.id, now, { messagesSent: 0, pendingReview: 0 });
    return { ...EMPTY_EVALUATION_RESULT };
  }

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
    const outcome = await evaluateChargeStepPair(charge, step, rule.status, requiresApprovedTemplate, settings, now);
    if (outcome.kind === 'pending') pending.push(outcome.step);
    else if (outcome.kind === 'skipped') skipped++;
    else if (outcome.kind === 'pendingReview') pendingReview++;
    else if (outcome.kind === 'suspended') suspended++;
  }

  const consolidated = consolidate(pending);
  let queued = 0;
  // Message de fato criada nesta passada — diferente de `queued`, que soma
  // passos consolidados. Um cliente com 2 cobranças no mesmo passo vira 1
  // Message só; "N mensagens" na tela precisa contar a Message, não o passo.
  let messagesSent = 0;

  for (const msg of consolidated) {
    const stepsQueued = await persistConsolidatedMessage(msg, now, settings.timezone);
    queued += stepsQueued;
    if (stepsQueued > 0) messagesSent++;
  }

  await recordRuleRun(rule.id, now, { messagesSent, pendingReview });

  return { queued, skipped, pendingReview, suspended };
}
