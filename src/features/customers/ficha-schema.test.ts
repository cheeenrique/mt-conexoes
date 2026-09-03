import { describe, expect, it } from 'vitest';
import { customerFichaSchema, EMPTY_CUSTOMER_FICHA_FORM } from './ficha-schema';

const BASE = {
  ...EMPTY_CUSTOMER_FICHA_FORM,
  name: 'Cliente Teste',
  priceCents: '5000',
  costCents: '2000',
};

describe('customerFichaSchema — telefone', () => {
  it('aceita WhatsApp brasileiro', () => {
    const result = customerFichaSchema.safeParse({ ...BASE, phone: '+5562998133401' });
    expect(result.success).toBe(true);
  });

  it('aceita WhatsApp de outro país (bug real: só passava +55)', () => {
    const result = customerFichaSchema.safeParse({ ...BASE, phone: '+13055551234' });
    expect(result.success).toBe(true);
  });

  it('recusa telefone sem "+" na frente', () => {
    const result = customerFichaSchema.safeParse({ ...BASE, phone: '5511999998888' });
    expect(result.success).toBe(false);
  });

  it('recusa telefone curto demais pra ser um número real', () => {
    const result = customerFichaSchema.safeParse({ ...BASE, phone: '+551' });
    expect(result.success).toBe(false);
  });

  it('recusa telefone maior que o limite do E.164 (15 dígitos após o +)', () => {
    const result = customerFichaSchema.safeParse({ ...BASE, phone: '+1234567890123456' });
    expect(result.success).toBe(false);
  });
});
