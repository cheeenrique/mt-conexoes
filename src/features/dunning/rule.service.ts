import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { SUGGESTED_STEPS } from './suggested-steps';
import type { CreateDunningRuleInput } from './schema';

/**
 * Ciclo de vida da régua como entidade: criar, renomear, trocar a padrão e
 * mover o estado. O CRUD dos passos e a ativação (que decide o que fazer com os
 * retroativos) ficam em `service.ts` — split por coesão, ver
 * `.claude/rules/01-arquitetura.md`.
 */

export class DunningRuleNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Essa régua não existe mais. Atualize a página.', 'DUNNING_RULE_NOT_FOUND', { cause });
  }
}

export class InvalidDunningStatusTransitionError extends DomainError {
  constructor(from: string, cause?: unknown) {
    super(
      from === 'DRAFT'
        ? 'Rascunho vai para revisão antes de ficar ativa. Não existe atalho de rascunho para ativa.'
        : 'Essa mudança de estado não é permitida para a régua como ela está agora.',
      'INVALID_DUNNING_STATUS_TRANSITION',
      { cause },
    );
  }
}

type RuleStatus = 'DRAFT' | 'REVIEW' | 'ACTIVE' | 'PAUSED';

/**
 * As transições que a tela oferece. `REVIEW → ACTIVE` não está aqui de
 * propósito: ativar passa por `activateDunningRule`, que exige a decisão sobre
 * cobrança retroativa na frente da lista real do que sairia.
 */
const ALLOWED_TRANSITIONS: Record<RuleStatus, RuleStatus[]> = {
  DRAFT: ['REVIEW'],
  REVIEW: [],
  ACTIVE: ['PAUSED'],
  PAUSED: ['ACTIVE'],
};

export async function createRule(input: CreateDunningRuleInput): Promise<{ id: string }> {
  const steps = await resolveNewRuleSteps(input);

  // Nasce sempre DRAFT e nunca padrão: criar régua não pode trocar quem cobra
  // todo mundo por efeito colateral (handoff `telas/07-reguas.md`).
  const rule = await db.$transaction(async (tx) => {
    const created = await tx.dunningRule.create({
      data: { name: input.name, status: 'DRAFT', isDefault: false },
    });
    if (steps.length > 0) {
      await tx.dunningStep.createMany({ data: steps.map((step) => ({ ...step, ruleId: created.id })) });
    }
    return created;
  });

  return { id: rule.id };
}

async function resolveNewRuleSteps(input: CreateDunningRuleInput) {
  if (input.stepsSource === 'suggested') return SUGGESTED_STEPS;
  if (input.stepsSource !== 'copy' || !input.copyFromRuleId) return [];

  const source = await db.dunningStep.findMany({
    where: { ruleId: input.copyFromRuleId },
    select: { offsetDays: true, action: true, templateBody: true, isActive: true },
    orderBy: { offsetDays: 'asc' },
  });
  if (source.length === 0) {
    const exists = await db.dunningRule.findUnique({ where: { id: input.copyFromRuleId }, select: { id: true } });
    if (!exists) throw new DunningRuleNotFoundError();
  }
  return source;
}

export async function renameRule(id: string, name: string): Promise<void> {
  const updated = await db.dunningRule.updateMany({ where: { id }, data: { name } });
  if (updated.count === 0) throw new DunningRuleNotFoundError();
}

/**
 * ⚠️ Uma transação, e desmarcar antes de marcar.
 *
 * O índice único parcial `dunning_rules_single_default` recusa duas linhas com
 * `isDefault = true` no mesmo instante. Marcar a nova primeiro estoura no
 * próprio statement; fora de transação, uma falha entre os dois passos deixa o
 * sistema sem régua padrão nenhuma e o cron sem o que avaliar.
 */
export async function setDefaultRule(id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const target = await tx.dunningRule.findUnique({ where: { id }, select: { id: true } });
    if (!target) throw new DunningRuleNotFoundError();

    await tx.dunningRule.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    await tx.dunningRule.update({ where: { id }, data: { isDefault: true } });
  });
}

export class DunningRuleIsDefaultError extends DomainError {
  constructor(cause?: unknown) {
    super('A régua padrão não pode ser excluída. Torne outra régua padrão primeiro.', 'DUNNING_RULE_IS_DEFAULT', {
      cause,
    });
  }
}

/**
 * Passos, execuções e a ligação com mensagem cascade pelo banco
 * (`dunning_steps.ruleId` e `dunning_executions.stepId` são `onDelete: Cascade`)
 * — a mensagem em si nunca é apagada, só o registro de qual passo a gerou.
 */
export async function deleteRule(id: string): Promise<void> {
  const rule = await db.dunningRule.findUnique({ where: { id }, select: { isDefault: true } });
  if (!rule) throw new DunningRuleNotFoundError();
  if (rule.isDefault) throw new DunningRuleIsDefaultError();

  await db.dunningRule.delete({ where: { id } });
}

export async function setRuleStatus(id: string, status: RuleStatus): Promise<void> {
  const rule = await db.dunningRule.findUnique({ where: { id }, select: { status: true } });
  if (!rule) throw new DunningRuleNotFoundError();
  if (rule.status === status) return;
  if (!ALLOWED_TRANSITIONS[rule.status as RuleStatus].includes(status)) {
    throw new InvalidDunningStatusTransitionError(rule.status);
  }

  await db.dunningRule.update({ where: { id }, data: { status } });
}
