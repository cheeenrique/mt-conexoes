import { describe, expect, it } from 'vitest';
import { formatCents } from './format';

describe('formatCents', () => {
  it('formata centavos como moeda BRL', () => {
    expect(formatCents('123456')).toBe('R$ 1.234,56');
  });

  it('aceita bigint diretamente', () => {
    expect(formatCents(100n)).toBe('R$ 1,00');
  });

  it('formata zero', () => {
    expect(formatCents(0n)).toBe('R$ 0,00');
  });
});
