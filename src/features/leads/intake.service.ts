import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { evaluateLeadRateLimit, leadWindowStart } from '@/core/lead-rate-limit';
import type { LeadIntakeInput } from './schema';
import { createLead } from './service';
import { verifyTurnstile } from './turnstile';

export class LeadRateLimitedError extends DomainError {
  constructor(readonly retryAfterSeconds: number, cause?: unknown) {
    super('Muitos envios deste endereço. Tente de novo mais tarde.', 'LEAD_RATE_LIMITED', { cause });
  }
}

export class LeadChallengeRejectedError extends DomainError {
  constructor(cause?: unknown) {
    super('Não foi possível confirmar o envio. Recarregue a página e tente de novo.', 'LEAD_CHALLENGE_REJECTED', {
      cause,
    });
  }
}

/**
 * Tentativas que contam para a janela deslizante.
 *
 * ⚠️ `RATE_LIMITED` fica de fora de propósito, embora seja gravada para
 * auditoria: se a tentativa bloqueada também contasse, insistir renovaria o
 * bloqueio para sempre. O visitante legítimo atrás de NAT de operadora
 * móvel nunca mais conseguiria enviar, e o bot — que não desiste — ganharia
 * exatamente nada com isso.
 */
const COUNTED_OUTCOMES = ['ACCEPTED', 'INVALID'] as const;

async function assertWithinRateLimit(ip: string, now: Date): Promise<void> {
  const where = { ip, outcome: { in: [...COUNTED_OUTCOMES] }, createdAt: { gte: leadWindowStart(now) } };
  const [attemptsInWindow, oldest] = await Promise.all([
    db.leadAttempt.count({ where }),
    db.leadAttempt.findFirst({ where, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
  ]);

  const decision = evaluateLeadRateLimit({
    attemptsInWindow,
    oldestAttemptAt: oldest?.createdAt ?? null,
    now,
  });
  if (decision.allowed) return;

  await db.leadAttempt.create({ data: { ip, outcome: 'RATE_LIMITED' } });
  throw new LeadRateLimitedError(decision.retryAfterSeconds);
}

/**
 * Captura vinda do site público. Ordem importa: rate limit antes do
 * Turnstile, porque o Turnstile é uma chamada HTTP a terceiro — deixá-lo na
 * frente daria a qualquer bot um gerador gratuito de tráfego de saída.
 */
export async function captureLead(params: { data: LeadIntakeInput; ip: string; now: Date }): Promise<{ leadId: string }> {
  const { turnstileToken, ...lead } = params.data;

  await assertWithinRateLimit(params.ip, params.now);

  if (!(await verifyTurnstile(turnstileToken, params.ip))) {
    await db.leadAttempt.create({ data: { ip: params.ip, outcome: 'INVALID' } });
    throw new LeadChallengeRejectedError();
  }

  const created = await createLead(lead);
  await db.leadAttempt.create({ data: { ip: params.ip, outcome: 'ACCEPTED' } });
  return { leadId: created.id };
}

/** Envio recusado antes de virar lead — conta para o rate limit do IP. */
export function recordRejectedIntake(ip: string): Promise<unknown> {
  return db.leadAttempt.create({ data: { ip, outcome: 'INVALID' } });
}
