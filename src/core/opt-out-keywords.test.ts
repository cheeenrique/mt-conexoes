import { describe, expect, it } from 'vitest';
import { matchOptOutKeyword } from './opt-out-keywords';

describe('matchOptOutKeyword', () => {
  it('reconhece cada palavra da whitelist, exata', () => {
    expect(matchOptOutKeyword('PARE')).toBe('PARE');
    expect(matchOptOutKeyword('SAIR')).toBe('SAIR');
    expect(matchOptOutKeyword('CANCELAR')).toBe('CANCELAR');
    expect(matchOptOutKeyword('DESCADASTRAR')).toBe('DESCADASTRAR');
    expect(matchOptOutKeyword('STOP')).toBe('STOP');
  });

  it('case-insensitive e com espaço nas bordas', () => {
    expect(matchOptOutKeyword('pare')).toBe('PARE');
    expect(matchOptOutKeyword('  Pare  ')).toBe('PARE');
    expect(matchOptOutKeyword('Sair')).toBe('SAIR');
  });

  it('não dispara em substring dentro de frase', () => {
    expect(matchOptOutKeyword('não quero mais pagar, pare com isso')).toBeNull();
    expect(matchOptOutKeyword('vou pararar de responder')).toBeNull();
  });

  it('texto sem nenhuma palavra-chave retorna null', () => {
    expect(matchOptOutKeyword('Oi, tudo bem?')).toBeNull();
    expect(matchOptOutKeyword('')).toBeNull();
  });
});
