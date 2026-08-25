import { describe, expect, it } from 'vitest';
import { toE164, nationalDigitsBR, phoneSearchDigits, normalizePhoneBR } from './phone';

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

describe('nationalDigitsBR', () => {
  it('descasca o código de país de um celular com 55', () => {
    expect(nationalDigitsBR('+5562991802244')).toBe('62991802244');
    expect(nationalDigitsBR('5562991802244')).toBe('62991802244');
  });

  it('descasca o código de país de um fixo com 55', () => {
    expect(nationalDigitsBR('+556232221100')).toBe('6232221100');
  });

  it('aceita número sem código de país explícito', () => {
    expect(nationalDigitsBR('62991802244')).toBe('62991802244');
    expect(nationalDigitsBR('6232221100')).toBe('6232221100');
  });

  it('não descasca "+" de país estrangeiro só porque bate no tamanho de um celular BR', () => {
    expect(nationalDigitsBR('+13105551234')).toBeNull();
  });

  it('recusa o que não tem tamanho de telefone nacional', () => {
    expect(nationalDigitsBR('123')).toBeNull();
    expect(nationalDigitsBR('')).toBeNull();
  });
});

describe('phoneSearchDigits', () => {
  it('descarta a formatação que o operador digita', () => {
    expect(phoneSearchDigits('(11) 9')).toBe('119');
    expect(phoneSearchDigits('62 99813-3401')).toBe('62998133401');
    expect(phoneSearchDigits('+55 62 99813-3401')).toBe('5562998133401');
  });

  it('devolve null quando o termo é nome ou usuário de acesso', () => {
    expect(phoneSearchDigits('João')).toBeNull();
    expect(phoneSearchDigits('joao.silva2')).toBeNull();
  });

  it('devolve null quando não sobra dígito nenhum', () => {
    expect(phoneSearchDigits('')).toBeNull();
    expect(phoneSearchDigits('()- ')).toBeNull();
  });
});

describe('normalizePhoneBR', () => {
  it('normaliza número formatado com DDD pra E.164', () => {
    expect(normalizePhoneBR('(11) 99999-8888')).toBe('+5511999998888');
  });

  it('aceita dígitos crus, sem formatação', () => {
    expect(normalizePhoneBR('11999998888')).toBe('+5511999998888');
  });

  it('é idempotente em número já em E.164', () => {
    expect(normalizePhoneBR('+5511999998888')).toBe('+5511999998888');
  });

  it('recusa número sem DDD — nunca chuta', () => {
    expect(normalizePhoneBR('9999-8888')).toBeNull();
  });

  it('recusa string vazia', () => {
    expect(normalizePhoneBR('')).toBeNull();
  });
});
