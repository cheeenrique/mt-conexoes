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
  /** Nome do template aprovado na Meta pra este passo — `null` em canal de texto livre. */
  metaTemplateName: string | null;
  /** Valores posicionais já resolvidos (ver `resolveTemplateParams`) — `null` junto com `metaTemplateName`. */
  metaTemplateParams: Record<string, string> | null;
};

export type ConsolidatedMessage = {
  customerId: string;
  toPhone: string;
  body: string; // só o template base renderizado, sem sufixo
  extraCount: number; // 0 quando só há 1 passo pendente pro cliente
  extraCents: string; // soma bruta em centavos dos passos "extras", BigInt.toString()
  stepIds: string[];
  chargeIds: string[];
  /**
   * Template do passo **base** (o mesmo que fornece `body`), passado adiante sem
   * decisão nenhuma — `consolidate` não sabe se o canal exige template. Quem
   * decide se um `extraCount > 0` pode sair com este template (não pode, hoje: não
   * existe template de consolidação aprovado) é `evaluate.ts`, que conhece o canal.
   */
  templateName: string | null;
  templateParams: Record<string, string> | null;
};

/** Agrupa passos pendentes por cliente — no máximo 1 mensagem por customerId. */
export function consolidate(pending: PendingStep[]): ConsolidatedMessage[] {
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
    const others = sorted.slice(1);
    const extraCents = others.reduce((sum, s) => sum + BigInt(s.netCents), 0n);

    results.push({
      customerId,
      toPhone: base.toPhone,
      body: renderTemplate(base.templateBody, base.context),
      extraCount: others.length,
      extraCents: extraCents.toString(),
      stepIds: group.map((s) => s.stepId),
      chargeIds: group.map((s) => s.chargeId),
      templateName: base.metaTemplateName,
      templateParams: base.metaTemplateParams,
    });
  }
  return results;
}
