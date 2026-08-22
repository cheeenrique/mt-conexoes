import { db } from '@/lib/db';
import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';
import { assertKnownVariables } from '@/core/dunning-template';
import { DunningRuleNotFoundError } from './rule.service';
import { offsetDaysFrom } from './step-offset';
import type { DunningStepInput } from './schema';

export { UnknownTemplateVariableError };

export class DuplicateStepOffsetError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um passo com esse deslocamento nesta régua.', 'DUPLICATE_STEP_OFFSET', { cause });
  }
}

// Handoff da tela de réguas, regra 1: "rascunho → em revisão → ativa, sem atalho".
// A revisão existe para o operador ver a lista do que sairia antes de ativar.
export class DunningRuleNotInReviewError extends DomainError {
  constructor(cause?: unknown) {
    super('A régua precisa estar em revisão antes de ser ativada.', 'DUNNING_RULE_NOT_IN_REVIEW', { cause });
  }
}

function validateTemplate(templateBody: string | undefined): void {
  if (!templateBody) return;
  try {
    assertKnownVariables(templateBody);
  } catch (err) {
    throw new UnknownTemplateVariableError(err instanceof Error ? err.message : 'Variável de template desconhecida.', err);
  }
}

/** Campos comuns entre criar e atualizar — só `ruleId` (obrigatório só na criação) fica de fora. */
function stepFields(input: DunningStepInput) {
  return {
    offsetDays: offsetDaysFrom(input.days, input.direction),
    action: input.action,
    templateBody: input.templateBody ?? null,
    metaTemplateName: input.metaTemplateName ?? null,
    isActive: input.isActive,
  };
}

export async function createStep(ruleId: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.create({ data: { ruleId, ...stepFields(input) } });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function updateStep(id: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.update({ where: { id }, data: stepFields(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function deleteStep(id: string) {
  await db.dunningStep.delete({ where: { id } });
}

/**
 * ⚠️ Recebe o id da régua que o operador tem na tela, não "a padrão".
 *
 * A tela é mestre-detalhe e uma régua em revisão pode perfeitamente não ser a
 * padrão. Resolver a régua por `isDefault` aqui dentro ativaria uma régua
 * diferente da que o operador acabou de revisar linha a linha — que é o
 * contrário do que a revisão existe para garantir.
 */
export async function activateDunningRule(ruleId: string, mode: 'send-all' | 'ignore-retroactive'): Promise<void> {
  const rule = await db.dunningRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new DunningRuleNotFoundError();
  if (rule.status !== 'REVIEW') throw new DunningRuleNotInReviewError();

  if (mode === 'ignore-retroactive') {
    const steps = await db.dunningStep.findMany({ where: { ruleId: rule.id }, select: { id: true } });
    await db.dunningExecution.deleteMany({
      where: { stepId: { in: steps.map((s) => s.id) }, outcome: 'PENDING_REVIEW' },
    });
  }

  await db.dunningRule.update({ where: { id: rule.id }, data: { status: 'ACTIVE' } });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
