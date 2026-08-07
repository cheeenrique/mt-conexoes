import { describe, expect, it } from 'vitest';
import { subscriptionSchema } from './schema';

const VALID_INPUT = {
  priceCents: '1000',
  costCents: '500',
  cycle: 'MONTHLY' as const,
  screens: 1,
};

describe('subscriptionSchema — discountUntil', () => {
  it('rejeita string que não é data, com mensagem em pt-BR, antes de chegar no Prisma', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountUntil: 'abc' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Data de validade inválida.');
    }
  });

  it('aceita string vazia (sem desconto)', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountUntil: '' });
    expect(result.success).toBe(true);
  });

  it('aceita undefined (campo não enviado)', () => {
    const result = subscriptionSchema.safeParse(VALID_INPUT);
    expect(result.success).toBe(true);
  });

  it('aceita data no formato YYYY-MM-DD', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountUntil: '2026-08-07' });
    expect(result.success).toBe(true);
  });
});
