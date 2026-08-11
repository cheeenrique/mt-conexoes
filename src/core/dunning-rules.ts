import { localDateOnly } from './dates';
import { renderTemplate, type TemplateContext } from './dunning-template';

/** Dias entre hoje (local) e o vencimento — negativo = antes, positivo = depois. */
export function daysFromDue(dueAt: Date, now: Date, timezone: string): number {
  const dueLocal = localDateOnly(dueAt, timezone);
  const nowLocal = localDateOnly(now, timezone);
  const diffMs = nowLocal.getTime() - dueLocal.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export type PendingStep = {
  customerId: string;
  toPhone: string;
  chargeId: string;
  stepId: string;
  offsetDays: number;
  templateBody: string;
  netCents: string;
  context: TemplateContext;
};

export type ConsolidatedMessage = {
  customerId: string;
  toPhone: string;
  body: string;
  stepIds: string[];
  chargeIds: string[];
};

function formatBRL(cents: bigint): string {
  return (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Agrupa passos pendentes por cliente — no máximo 1 mensagem por customerId. */
export function consolidate(pending: PendingStep[], _timezone: string): ConsolidatedMessage[] {
  const byCustomer = new Map<string, PendingStep[]>();
  for (const step of pending) {
    const group = byCustomer.get(step.customerId) ?? [];
    group.push(step);
    byCustomer.set(step.customerId, group);
  }

  const results: ConsolidatedMessage[] = [];
  for (const [customerId, group] of byCustomer) {
    const sorted = [...group].sort((a, b) => b.offsetDays - a.offsetDays);
    const base = sorted[0];
    let body = renderTemplate(base.templateBody, base.context);

    if (sorted.length > 1) {
      const othersCents = sorted.slice(1).reduce((sum, s) => sum + BigInt(s.netCents), 0n);
      body += `\n\n+ mais ${sorted.length - 1} cobrança(s), totalizando ${formatBRL(othersCents)}`;
    }

    results.push({
      customerId,
      toPhone: base.toPhone,
      body,
      stepIds: group.map((s) => s.stepId),
      chargeIds: group.map((s) => s.chargeId),
    });
  }
  return results;
}
