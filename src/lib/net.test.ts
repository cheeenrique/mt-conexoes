import { describe, expect, it } from 'vitest';
import { getClientIp } from './net';

describe('getClientIp', () => {
  it('devolve "unknown" quando o header é null', () => {
    expect(getClientIp(null)).toBe('unknown');
  });

  it('devolve "unknown" quando o header está vazio', () => {
    expect(getClientIp('')).toBe('unknown');
  });

  it('usa o único IP quando a chain tem uma entrada só (dev local, sem proxy)', () => {
    expect(getClientIp('203.0.113.9')).toBe('203.0.113.9');
  });

  it('usa a última entrada quando a chain tem duas (cliente + Cloud Run)', () => {
    // Cloud Run sem load balancer externo na frente acrescenta só 1 hop: a IP
    // real que ele observou, ao final de qualquer XFF que o cliente mandou.
    // A última entrada é a confiável — a primeira é o valor cru do cliente.
    expect(getClientIp('1.2.3.4, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('usa a última entrada mesmo com múltiplas entradas antes dela', () => {
    expect(getClientIp('1.2.3.4, 5.6.7.8, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('ignora padding forjado pelo atacante à esquerda da chain', () => {
    // Um atacante pode mandar quantas entradas quiser em X-Forwarded-For —
    // só a última, acrescentada pelo próprio Cloud Run, é confiável.
    expect(getClientIp('atacante-forjado-1, atacante-forjado-2, 203.0.113.9')).toBe('203.0.113.9');
  });

  it('ignora espaços em branco entre as entradas', () => {
    expect(getClientIp('1.2.3.4,   5.6.7.8  ,203.0.113.9')).toBe('203.0.113.9');
  });
});
