import { describe, expect, it } from 'vitest';
import { getClientIp } from './net';

describe('getClientIp', () => {
  it('devolve "unknown" quando o header é null', () => {
    expect(getClientIp(null)).toBe('unknown');
  });

  it('devolve "unknown" quando o header está vazio', () => {
    expect(getClientIp('')).toBe('unknown');
  });

  it('usa o único IP quando a chain tem uma entrada só (dev local)', () => {
    expect(getClientIp('203.0.113.9')).toBe('203.0.113.9');
  });

  it('usa a penúltima entrada quando a chain tem duas (cliente + GFE)', () => {
    // GFE do Cloud Run acrescenta a IP real observada ao final da chain
    // recebida do cliente — a penúltima é a confiável, não a crua/primeira.
    expect(getClientIp('1.2.3.4, 203.0.113.9')).toBe('1.2.3.4');
  });

  it('usa a penúltima entrada quando a chain tem três ou mais', () => {
    expect(getClientIp('1.2.3.4, 5.6.7.8, 203.0.113.9')).toBe('5.6.7.8');
  });

  it('ignora espaços em branco entre as entradas', () => {
    expect(getClientIp('1.2.3.4,   5.6.7.8  ,203.0.113.9')).toBe('5.6.7.8');
  });
});
