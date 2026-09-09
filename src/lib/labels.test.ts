import { describe, expect, it } from 'vitest';
import { customerSituationLabel } from './labels';

describe('customerSituationLabel', () => {
  it('atraso carrega quantos dias — é o que separa 2 dias de 34', () => {
    expect(customerSituationLabel('OVERDUE', 2)).toBe('Em atraso · 2d');
    expect(customerSituationLabel('OVERDUE', 34)).toBe('Em atraso · 34d');
  });

  it('vencimento chegando conta os dias que faltam, sem sinal negativo na tela', () => {
    expect(customerSituationLabel('DUE_SOON', -1)).toBe('Vence em 1d');
    expect(customerSituationLabel('DUE_SOON', -3)).toBe('Vence em 3d');
  });

  it('os degraus sem contador ficam no rótulo simples', () => {
    expect(customerSituationLabel('UP_TO_DATE', -12)).toBe('Em dia');
    expect(customerSituationLabel('DUE_TODAY', 0)).toBe('Vence hoje');
  });

  it('sem cobrança em aberto não inventa contador', () => {
    expect(customerSituationLabel('NO_CHARGE', null)).toBe('Sem cobrança');
    expect(customerSituationLabel('SUSPENDED', null)).toBe('Suspenso');
  });

  // Suspenso com cobrança vencida existe: a situação ganha do atraso, mas o
  // offset continua vindo preenchido do DTO. O rótulo não pode virar
  // "Suspenso · 9d" — o contador só faz sentido nos degraus da escada.
  it('estado fora da escada ignora o offset que vier junto', () => {
    expect(customerSituationLabel('SUSPENDED', 9)).toBe('Suspenso');
    expect(customerSituationLabel('DELETED', 4)).toBe('Removido');
  });
});
