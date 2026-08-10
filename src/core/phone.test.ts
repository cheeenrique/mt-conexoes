import { describe, expect, it } from 'vitest';
import { toE164 } from './phone';

describe('toE164', () => {
  it('adiciona "+" em telefone que chega só com dígitos (formato do webhook)', () => {
    expect(toE164('5511999998888')).toBe('+5511999998888');
  });

  it('é idempotente em telefone já prefixado com "+"', () => {
    expect(toE164('+5511999998888')).toBe('+5511999998888');
  });

  it('remove caracteres de formatação estranhos a um WhatsApp ID', () => {
    expect(toE164('55 11 99999-8888')).toBe('+5511999998888');
    expect(toE164('(11) 99999-8888')).toBe('+11999998888');
  });
});
