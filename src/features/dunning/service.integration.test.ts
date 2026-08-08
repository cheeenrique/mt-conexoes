import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createStep, updateStep, deleteStep, UnknownTemplateVariableError, DuplicateStepOffsetError } from './service';

let ruleId: string;

afterEach(async () => {
  await db.dunningStep.deleteMany({ where: { offsetDays: { in: [42, 43] } } });
});

describe('createStep', () => {
  it('rejeita variável desconhecida antes de tocar o banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await expect(
      createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.apelido}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);

    const created = await db.dunningStep.findFirst({ where: { ruleId, offsetDays: 42 } });
    expect(created).toBeNull();
  });

  it('cria passo com template válido', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    const step = await createStep(ruleId, { offsetDays: 43, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}', isActive: true });

    expect(step.offsetDays).toBe(43);
  });

  it('dois passos com o mesmo offsetDays na mesma régua batem na constraint do banco', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    ruleId = rule.id;

    await createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      createStep(ruleId, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Outro {{negocio.nome}}', isActive: true }),
    ).rejects.toThrow(DuplicateStepOffsetError);
  });
});

describe('updateStep', () => {
  it('re-valida o template ao atualizar', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await expect(
      updateStep(step.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{variavel.inexistente}}', isActive: true }),
    ).rejects.toThrow(UnknownTemplateVariableError);
  });
});

describe('deleteStep', () => {
  it('remove o passo', async () => {
    const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true } });
    const step = await createStep(rule.id, { offsetDays: 42, action: 'SEND_MESSAGE', templateBody: 'Olá {{negocio.nome}}', isActive: true });

    await deleteStep(step.id);

    const found = await db.dunningStep.findUnique({ where: { id: step.id } });
    expect(found).toBeNull();
  });
});
