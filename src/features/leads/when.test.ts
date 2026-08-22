import { describe, expect, it } from 'vitest';
import { relativeWhen } from './when';

const TZ = 'America/Sao_Paulo';
// 22/08/2026 09:00 em São Paulo (UTC-3).
const NOW = new Date('2026-08-22T12:00:00.000Z');

function label(iso: string): string {
  return relativeWhen(new Date(iso), NOW, TZ);
}

describe('relativeWhen', () => {
  it('mostra "agora" no primeiro minuto', () => {
    expect(label('2026-08-22T11:59:30.000Z')).toBe('agora');
  });

  it('conta minutos, com singular', () => {
    expect(label('2026-08-22T11:59:00.000Z')).toBe('há 1 minuto');
    expect(label('2026-08-22T11:15:00.000Z')).toBe('há 45 minutos');
  });

  it('conta horas, com singular', () => {
    expect(label('2026-08-22T11:00:00.000Z')).toBe('há 1 hora');
    expect(label('2026-08-22T10:00:00.000Z')).toBe('há 2 horas');
  });

  // "Ontem" é dia de calendário local, não "24h atrás": às 09:00 de sábado,
  // 23:00 de sexta faz 10 horas — mas para o operador é ontem.
  it('usa o dia local para "ontem", não a diferença de 24h', () => {
    expect(label('2026-08-22T02:00:00.000Z')).toBe('ontem');
  });

  it('conta dias entre 2 e 6', () => {
    expect(label('2026-08-20T12:00:00.000Z')).toBe('2 dias');
    expect(label('2026-08-17T12:00:00.000Z')).toBe('5 dias');
  });

  it('vira data absoluta a partir de uma semana', () => {
    expect(label('2026-08-15T12:00:00.000Z')).toBe('15/08/2026');
  });

  // O fuso do negócio manda: 01:00 UTC do dia 22 ainda é dia 21 em São Paulo.
  it('formata a data absoluta no fuso do negócio, não no do servidor', () => {
    expect(relativeWhen(new Date('2026-08-01T01:00:00.000Z'), NOW, TZ)).toBe('31/07/2026');
  });
});
