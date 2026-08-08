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

describe('subscriptionSchema — discountType/discountValue', () => {
  it('rejeita discountType sem discountValue', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountType: 'PERCENT', discountValue: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'discountValue');
      expect(issue?.message).toBe('Informe o valor do desconto para o tipo selecionado.');
    }
  });

  it('rejeita discountValue sem discountType', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountType: '', discountValue: '10.00' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'discountType');
      expect(issue?.message).toBe('Selecione o tipo do desconto informado.');
    }
  });

  it('rejeita desconto PERCENT acima de 100', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountType: 'PERCENT', discountValue: '150' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'discountValue');
      expect(issue?.message).toBe('Desconto percentual não pode passar de 100%.');
    }
  });

  it('aceita desconto PERCENT igual a 100', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountType: 'PERCENT', discountValue: '100' });
    expect(result.success).toBe(true);
  });

  it('normaliza vírgula decimal pra ponto e aceita', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: '10000', discountType: 'FIXED', discountValue: '10,50' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountValue).toBe('10.50');
    }
  });

  it('aceita valor com ponto decimal normalmente', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: '10000', discountType: 'FIXED', discountValue: '10.50' });
    expect(result.success).toBe(true);
  });

  it('rejeita valor com mais de 8 dígitos inteiros (overflow do DECIMAL(10,2))', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, discountType: 'FIXED', discountValue: '123456789' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'discountValue');
      expect(issue?.message).toBe('Valor de desconto inválido.');
    }
  });

  it('aceita combinação válida tipo + valor sem estourar dígitos', () => {
    // priceCents cobre o discountValue de propósito — este teste é sobre o
    // bound de dígitos do DECIMAL(10,2), não sobre o bound de preço (coberto
    // à parte em 'subscriptionSchema — FIXED vs priceCents').
    const result = subscriptionSchema.safeParse({
      ...VALID_INPUT,
      priceCents: '10000000000',
      discountType: 'FIXED',
      discountValue: '99999999.99',
    });
    expect(result.success).toBe(true);
  });
});

describe('subscriptionSchema — FIXED vs priceCents', () => {
  it('rejeita desconto FIXED maior que o preço, com mensagem em pt-BR', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: '10000', discountType: 'FIXED', discountValue: '500.00' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'discountValue');
      expect(issue?.message).toBe('Desconto não pode ser maior que o preço da assinatura.');
    }
  });

  it('aceita desconto FIXED igual ao preço', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: '10000', discountType: 'FIXED', discountValue: '100.00' });
    expect(result.success).toBe(true);
  });

  it('aceita desconto FIXED menor que o preço, com conversão reais→centavos correta', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: '10000', discountType: 'FIXED', discountValue: '10.50' });
    expect(result.success).toBe(true);
  });

  // priceCents malformado é coberto pela regra própria do campo
  // ('Preço inválido.'), mas o cross-check de FIXED vs priceCents rodava
  // incondicionalmente e construía um Decimal a partir de 'abc' — `safeParse`
  // nunca pode lançar, sempre devolve um resultado.
  it('não lança quando priceCents é malformado com desconto FIXED — retorna erro de validação', () => {
    const result = subscriptionSchema.safeParse({ ...VALID_INPUT, priceCents: 'abc', discountType: 'FIXED', discountValue: '10.50' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'priceCents');
      expect(issue?.message).toBe('Preço inválido.');
    }
  });
});
