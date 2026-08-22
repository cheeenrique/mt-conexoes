import { describe, expect, it } from 'vitest';
import { dispatchBatchSize, sendDelayMs } from './send-throttle';

describe('sendDelayMs', () => {
  it('sem jitter (random no meio da faixa), devolve exatamente o intervalo-base', () => {
    expect(sendDelayMs(20, () => 0.5)).toBe(3_000); // 60_000 / 20
    expect(sendDelayMs(80, () => 0.5)).toBe(750); // 60_000 / 80
  });

  it('jitter mínimo (random=0) reduz o intervalo em até 30%', () => {
    expect(sendDelayMs(20, () => 0)).toBe(2_100); // 3000 * 0.7
  });

  it('jitter máximo (random perto de 1) aumenta o intervalo em até ~30%', () => {
    expect(sendDelayMs(20, () => 0.999_999)).toBeCloseTo(3_900, -1);
  });

  it('nunca é negativo mesmo com rate limit alto e jitter mínimo', () => {
    expect(sendDelayMs(1000, () => 0)).toBeGreaterThanOrEqual(0);
  });

  it('rate limit zero ou negativo não atrasa nada — canal sem limite declarado', () => {
    expect(sendDelayMs(0, () => 0.5)).toBe(0);
    expect(sendDelayMs(-1, () => 0.5)).toBe(0);
  });
});

describe('dispatchBatchSize', () => {
  it('Evolution (20/min): 40 mensagens por lote', () => {
    expect(dispatchBatchSize(20)).toBe(40);
  });

  it('Meta Cloud (80/min): estoura o teto herdado, fica em 60', () => {
    expect(dispatchBatchSize(80)).toBe(60);
  });

  it('rate limit zero ou negativo cai no teto — sem limite declarado, sem motivo pra reduzir o lote', () => {
    expect(dispatchBatchSize(0)).toBe(60);
    expect(dispatchBatchSize(-5)).toBe(60);
  });
});
