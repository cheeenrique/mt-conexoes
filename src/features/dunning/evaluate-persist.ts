import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import type { ConsolidatedMessage } from '@/core/dunning-rules';
import { localDateOnly } from '@/core/dates';
import { logger } from '@/lib/logger';
import { buildConsolidatedBody } from './message-build';

/**
 * Toda escrita de `evaluateDunningRule` num só lugar — split por coesão de
 * `evaluate.ts` (orquestração + decisão por par) quando passou do orçamento de
 * `service.ts` (`.claude/rules/01-arquitetura.md`).
 */

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}

/** Registra um DunningExecution isolado (fora de transação). Falha não derruba a passada — loga e segue. */
export async function recordExecution(chargeId: string, stepId: string, outcome: 'PENDING_REVIEW' | 'SKIPPED' | 'QUEUED', reason?: string): Promise<boolean> {
  try {
    await db.dunningExecution.create({ data: { chargeId, stepId, outcome, reason } });
    return true;
  } catch (err) {
    logger.error({ job: 'dunning-evaluate', chargeId, stepId, error: String(err) });
    return false;
  }
}

/**
 * Grava o carimbo da passada na régua — só chega aqui se `evaluateDunningRule`
 * rodou até o fim (o `await` está no último passo da função). Uma exceção no
 * meio da avaliação propaga antes de tocar esta linha, então o carimbo nunca
 * afirma sucesso para uma passada que falhou. Roda mesmo com zero pares
 * (cobrança, passo) hoje — é o que distingue "motor rodou e não achou nada"
 * de "motor parou", para quem olha a tela.
 */
export async function recordRuleRun(ruleId: string, now: Date, counts: { messagesSent: number; pendingReview: number }): Promise<void> {
  try {
    await db.dunningRule.update({
      where: { id: ruleId },
      data: { lastRunAt: now, lastRunMessagesSent: counts.messagesSent, lastRunPendingReview: counts.pendingReview },
    });
  } catch (err) {
    logger.error({ job: 'dunning-evaluate', ruleId, error: String(err) });
  }
}

/**
 * Consolidação (extraCount > 0) num canal que exige template aprovado: não existe
 * template de consolidação aprovado na Meta ainda (ver `docs/projeto/tecnico/06-regua-e-canais.md`),
 * então nenhuma Message sai — cada (cobrança, passo) do grupo vira SKIPPED com motivo
 * próprio, igual ao T7 (`daily_dedupe`) abaixo, sem perder o rastro de auditoria.
 * `consolidate` (`core/`) não toma essa decisão: não sabe se o canal exige template,
 * só monta o grupo.
 */
export async function recordConsolidationBlocked(msg: ConsolidatedMessage): Promise<void> {
  try {
    await db.dunningExecution.createMany({
      data: msg.stepIds.map((stepId, i) => ({
        chargeId: msg.chargeIds[i],
        stepId,
        outcome: 'SKIPPED' as const,
        reason: 'consolidation_template_missing',
      })),
    });
  } catch (err) {
    logger.error({ job: 'dunning-evaluate', customerId: msg.customerId, error: String(err) });
  }
}

/** Persiste a Message consolidada + os DunningExecution correspondentes numa transação. Retorna quantos passos foram enfileirados. */
export async function persistConsolidatedMessage(msg: ConsolidatedMessage, now: Date, timezone: string): Promise<number> {
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
          // Congelados aqui, junto com `body` — nunca recalculados no despacho.
          // `null` quando o canal não exige template (Evolution) ou o passo não
          // tem um modelado; `evaluateChargeStepPair` já garantiu que nenhum passo
          // chega até aqui sem template num canal que o exige.
          templateName: msg.templateName,
          templateParams: (msg.templateParams ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull,
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
