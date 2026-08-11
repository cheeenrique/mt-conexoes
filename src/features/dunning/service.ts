import { db } from '@/lib/db';
import { DomainError, UnknownTemplateVariableError } from '@/lib/errors';
import { assertKnownVariables } from '@/core/dunning-template';
import type { DunningStepInput } from './schema';

export { UnknownTemplateVariableError };

export class DuplicateStepOffsetError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um passo com esse deslocamento nesta régua.', 'DUPLICATE_STEP_OFFSET', { cause });
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

export async function createStep(ruleId: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.create({
      data: { ruleId, offsetDays: input.offsetDays, action: input.action, templateBody: input.templateBody ?? null, isActive: input.isActive },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function updateStep(id: string, input: DunningStepInput) {
  validateTemplate(input.templateBody);
  try {
    return await db.dunningStep.update({
      where: { id },
      data: { offsetDays: input.offsetDays, action: input.action, templateBody: input.templateBody ?? null, isActive: input.isActive },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateStepOffsetError(err);
    throw err;
  }
}

export async function deleteStep(id: string) {
  await db.dunningStep.delete({ where: { id } });
}

export async function activateDunningRule(mode: 'send-all' | 'ignore-retroactive'): Promise<void> {
  const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });

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
