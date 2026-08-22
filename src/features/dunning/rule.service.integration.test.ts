import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  createRule,
  renameRule,
  setDefaultRule,
  setRuleStatus,
  DunningRuleNotFoundError,
  InvalidDunningStatusTransitionError,
} from './rule.service';
import { SUGGESTED_STEPS } from './suggested-steps';

const TEST_RULE_PREFIX = 'Régua de teste';

/**
 * Purga idempotente por chave natural, no `beforeAll` **e** no `afterAll`: o
 * Postgres de integração é compartilhado entre suítes e entre sessões, e um
 * crash no meio da passada deixaria uma régua de teste marcada como padrão —
 * o índice parcial `dunning_rules_single_default` derrubaria todas as
 * execuções seguintes, sem relação com o código sob teste.
 */
async function purge() {
  const seeded = await db.dunningRule.findFirst({ where: { name: 'Régua padrão' } });
  if (seeded && !seeded.isDefault) {
    await db.$transaction(async (tx) => {
      await tx.dunningRule.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      await tx.dunningRule.update({ where: { id: seeded.id }, data: { isDefault: true } });
    });
  }
  await db.dunningRule.deleteMany({ where: { name: { startsWith: TEST_RULE_PREFIX } } });
}

beforeAll(purge);
afterEach(purge);
afterAll(purge);

async function newRule(suffix: string, stepsSource: 'empty' | 'suggested' = 'empty') {
  return createRule({ name: `${TEST_RULE_PREFIX} ${suffix}`, stepsSource });
}

describe('createRule', () => {
  it('nasce em rascunho e não rouba a padrão de hoje', async () => {
    const previousDefault = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });

    const { id } = await newRule('rascunho');

    const created = await db.dunningRule.findUniqueOrThrow({ where: { id } });
    expect(created.status).toBe('DRAFT');
    expect(created.isDefault).toBe(false);

    const stillDefault = await db.dunningRule.findUniqueOrThrow({ where: { id: previousDefault.id } });
    expect(stillDefault.isDefault).toBe(true);
  });

  it('a régua sugerida nasce com D-5, D-2, D0, D+1, D+3 e suspensão em D+5', async () => {
    const { id } = await newRule('sugerida', 'suggested');

    const steps = await db.dunningStep.findMany({ where: { ruleId: id }, orderBy: { offsetDays: 'asc' } });
    expect(steps.map((step) => step.offsetDays)).toEqual([-5, -2, 0, 1, 3, 5]);
    expect(steps.at(-1)?.action).toBe('SUSPEND');
    expect(steps).toHaveLength(SUGGESTED_STEPS.length);
  });

  it('copiar os passos de outra régua traz texto e estado de cada passo', async () => {
    const source = await newRule('origem', 'suggested');

    const { id } = await createRule({
      name: `${TEST_RULE_PREFIX} cópia`,
      stepsSource: 'copy',
      copyFromRuleId: source.id,
    });

    const [original, copied] = await Promise.all([
      db.dunningStep.findMany({ where: { ruleId: source.id }, orderBy: { offsetDays: 'asc' } }),
      db.dunningStep.findMany({ where: { ruleId: id }, orderBy: { offsetDays: 'asc' } }),
    ]);
    expect(copied.map((s) => [s.offsetDays, s.action, s.templateBody])).toEqual(
      original.map((s) => [s.offsetDays, s.action, s.templateBody]),
    );
  });
});

describe('renameRule', () => {
  it('renomeia a régua', async () => {
    const { id } = await newRule('nome antigo');

    await renameRule(id, `${TEST_RULE_PREFIX} nome novo`);

    const renamed = await db.dunningRule.findUniqueOrThrow({ where: { id } });
    expect(renamed.name).toBe(`${TEST_RULE_PREFIX} nome novo`);
  });

  it('id que não existe mais vira erro de domínio, não erro do Prisma', async () => {
    await expect(renameRule('01890000-0000-7000-8000-000000000000', 'x')).rejects.toThrow(DunningRuleNotFoundError);
  });
});

describe('setDefaultRule', () => {
  it('desmarca a padrão antiga e marca a nova, sem instante com duas padrão', async () => {
    const previousDefault = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const { id } = await newRule('nova padrão');

    await setDefaultRule(id);

    const defaults = await db.dunningRule.findMany({ where: { isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(id);

    const old = await db.dunningRule.findUniqueOrThrow({ where: { id: previousDefault.id } });
    expect(old.isDefault).toBe(false);
  });

  it('marcar a régua que já é padrão é idempotente', async () => {
    const current = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });

    await setDefaultRule(current.id);

    const defaults = await db.dunningRule.findMany({ where: { isDefault: true } });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(current.id);
  });

  it('o banco recusa duas réguas padrão — a garantia não é o `if` do código', async () => {
    const { id } = await newRule('segunda padrão');

    // Marcar sem desmarcar a atual: é exatamente o que o índice parcial
    // `dunning_rules_single_default` existe para impedir.
    await expect(db.dunningRule.update({ where: { id }, data: { isDefault: true } })).rejects.toThrow();

    const defaults = await db.dunningRule.findMany({ where: { isDefault: true } });
    expect(defaults).toHaveLength(1);
  });
});

describe('setRuleStatus', () => {
  it('rascunho vai para revisão', async () => {
    const { id } = await newRule('para revisão');

    await setRuleStatus(id, 'REVIEW');

    expect((await db.dunningRule.findUniqueOrThrow({ where: { id } })).status).toBe('REVIEW');
  });

  it('rascunho não pula direto para ativa', async () => {
    const { id } = await newRule('sem atalho');

    await expect(setRuleStatus(id, 'ACTIVE')).rejects.toThrow(InvalidDunningStatusTransitionError);

    expect((await db.dunningRule.findUniqueOrThrow({ where: { id } })).status).toBe('DRAFT');
  });

  it('ativa pausa e pausada retoma', async () => {
    const { id } = await newRule('pausa');
    await db.dunningRule.update({ where: { id }, data: { status: 'ACTIVE' } });

    await setRuleStatus(id, 'PAUSED');
    expect((await db.dunningRule.findUniqueOrThrow({ where: { id } })).status).toBe('PAUSED');

    await setRuleStatus(id, 'ACTIVE');
    expect((await db.dunningRule.findUniqueOrThrow({ where: { id } })).status).toBe('ACTIVE');
  });
});
