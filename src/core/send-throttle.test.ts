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

  // Ritmo escolhido pro Evolution em 14/09/2026: uma mensagem por minuto, não 20.
  // O jitter é o que importa aqui — 60s cravado entre envios é tão reconhecível
  // quanto 3s cravado, só mais lento.
  it('1/min: intervalo-base de 60s, e o jitter espalha entre 42s e 78s', () => {
    expect(sendDelayMs(1, () => 0.5)).toBe(60_000);
    expect(sendDelayMs(1, () => 0)).toBe(42_000); // 60s * 0.7
    expect(sendDelayMs(1, () => 0.999_999)).toBeCloseTo(78_000, -2); // 60s * 1.3
  });
});

describe('dispatchBatchSize', () => {
  it('Evolution (20/min): 40 mensagens por lote', () => {
    expect(dispatchBatchSize(20)).toBe(40);
  });

  it('Meta Cloud (80/min): estoura o teto herdado, fica em 60', () => {
    expect(dispatchBatchSize(80)).toBe(60);
  });

  // 2 por passada × 4 passadas/hora × 11h de janela = 88 mensagens/dia de teto.
  // Com ~60s entre as duas e 14min até a próxima passada, a média real fica em
  // uma mensagem a cada ~7min — que é o ponto do exercício.
  it('1/min: 2 mensagens por lote, ~2min de wall-clock por passada', () => {
    expect(dispatchBatchSize(1)).toBe(2);
  });

  it('rate limit zero ou negativo cai no teto — sem limite declarado, sem motivo pra reduzir o lote', () => {
    expect(dispatchBatchSize(0)).toBe(60);
    expect(dispatchBatchSize(-5)).toBe(60);
  });
});
