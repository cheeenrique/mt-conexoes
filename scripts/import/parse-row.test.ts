import { describe, expect, it } from 'vitest';
import { normalizePhoneBR, parseCentsFromBR, parseDateBR } from './parse-row';

describe('normalizePhoneBR', () => {
  it('normaliza (11) 99999-8888 pra E.164', () => {
    expect(normalizePhoneBR('(11) 99999-8888')).toBe('+5511999998888');
  });

  it('normaliza 11999998888 sem formatação', () => {
    expect(normalizePhoneBR('11999998888')).toBe('+5511999998888');
  });

  it('aceita já em E.164', () => {
    expect(normalizePhoneBR('+5511999998888')).toBe('+5511999998888');
  });

  it('rejeita número sem DDD (recusa em vez de chutar)', () => {
    expect(normalizePhoneBR('9999-8888')).toBeNull();
  });

  it('rejeita vazio', () => {
    expect(normalizePhoneBR('')).toBeNull();
  });
});

describe('parseCentsFromBR', () => {
  it('parseia "R$ 1.234,56"', () => {
    expect(parseCentsFromBR('R$ 1.234,56')).toBe(123456n);
  });

  it('parseia "1234,56" sem prefixo', () => {
    expect(parseCentsFromBR('1234,56')).toBe(123456n);
  });

  it('parseia "1234.56" (formato US, caso o Excel exporte assim)', () => {
    expect(parseCentsFromBR('1234.56')).toBe(123456n);
  });

  it('parseia número puro (célula numérica do Excel)', () => {
    expect(parseCentsFromBR(1234.56)).toBe(123456n);
  });

  it('rejeita valor negativo', () => {
    expect(parseCentsFromBR('-10,00')).toBeNull();
  });

  it('rejeita texto não numérico', () => {
    expect(parseCentsFromBR('grátis')).toBeNull();
  });
});

describe('parseDateBR', () => {
  it('parseia "07/08/2026"', () => {
    const date = parseDateBR('07/08/2026');
    expect(date?.toISOString().slice(0, 10)).toBe('2026-08-07');
  });

  it('aceita um objeto Date direto (xlsx já converteu célula formatada como data)', () => {
    const input = new Date('2026-08-07T12:00:00Z');
    expect(parseDateBR(input)).toBe(input);
  });

  it('rejeita string vazia', () => {
    expect(parseDateBR('')).toBeNull();
  });

  it('rejeita data impossível', () => {
    expect(parseDateBR('32/13/2026')).toBeNull();
  });
});
