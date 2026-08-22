import { describe, expect, it } from 'vitest';
import { normalizeBrazilPhone } from './phone';

describe('normalizeBrazilPhone', () => {
  // O site manda o que o visitante digitou. Guardar isso cru quebra o
  // `@@unique` de Customer.phone na conversão: "(62) 99180-2244" e
  // "+5562991802244" são a mesma pessoa e passariam como dois clientes.
  it('normaliza o que o visitante digitou para E.164', () => {
    expect(normalizeBrazilPhone('(62) 99180-2244')).toBe('+5562991802244');
    expect(normalizeBrazilPhone('62 99180 2244')).toBe('+5562991802244');
    expect(normalizeBrazilPhone('+55 (62) 99180-2244')).toBe('+5562991802244');
    expect(normalizeBrazilPhone('5562991802244')).toBe('+5562991802244');
  });

  it('aceita fixo de 10 dígitos', () => {
    expect(normalizeBrazilPhone('6232221100')).toBe('+556232221100');
  });

  it('recusa o que não é telefone brasileiro', () => {
    expect(normalizeBrazilPhone('+13105551234')).toBeNull();
    expect(normalizeBrazilPhone('123')).toBeNull();
    expect(normalizeBrazilPhone('')).toBeNull();
  });
});
