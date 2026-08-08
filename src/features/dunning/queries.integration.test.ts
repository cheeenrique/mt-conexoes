import { describe, expect, it } from 'vitest';
import { getDefaultRuleWithSteps, listRecentChargesForPreview } from './queries';

describe('getDefaultRuleWithSteps', () => {
  it('devolve a régua padrão seedada com os passos ordenados por offsetDays', async () => {
    const rule = await getDefaultRuleWithSteps();

    expect(rule.isDefault).toBe(true);
    expect(rule.steps.length).toBeGreaterThanOrEqual(6);
    const offsets = rule.steps.map((s) => s.offsetDays);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});

describe('listRecentChargesForPreview', () => {
  it('nunca estoura mesmo sem nenhuma cobrança no banco além das existentes, e respeita o limite', async () => {
    const rows = await listRecentChargesForPreview(2);
    expect(rows.length).toBeLessThanOrEqual(2);
    if (rows.length > 0) {
      expect(rows[0]).toHaveProperty('customerName');
      expect(rows[0]).toHaveProperty('netCents');
      expect(rows[0]).toHaveProperty('dueAt');
    }
  });
});
