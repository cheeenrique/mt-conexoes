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

  // Suspenso passou a ser estado transitório: a régua corta por atraso e o
  // pagamento religa (charges/service.ts). O rótulo carrega o tamanho da
  // dívida pela mesma razão de "Em atraso · 34d" — cortado há 3 dias e cortado
  // há 3 meses pedem coisas diferentes do operador.
  it('suspenso carrega o atraso que motivou o corte', () => {
    expect(customerSituationLabel('SUSPENDED', 84)).toBe('Suspenso · 84d');
  });

  it('suspenso sem atraso não inventa contador — corte manual com cobrança em dia', () => {
    expect(customerSituationLabel('SUSPENDED', -5)).toBe('Suspenso');
    expect(customerSituationLabel('SUSPENDED', 0)).toBe('Suspenso');
  });

  it('estado fora da escada ignora o offset que vier junto', () => {
    expect(customerSituationLabel('DELETED', 4)).toBe('Removido');
    expect(customerSituationLabel('ANONYMIZED', 4)).toBe('Anonimizado');
  });
});
