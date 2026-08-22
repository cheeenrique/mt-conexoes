import { describe, expect, it } from 'vitest';
import { formatRunSummary } from './run-summary';

const TZ = 'America/Sao_Paulo';

describe('formatRunSummary', () => {
  it('DRAFT não tem linha — o motor nem avalia rascunho', () => {
    const result = formatRunSummary(
      { status: 'DRAFT', lastRunAt: null, lastRunMessagesSent: null, lastRunPendingReview: null },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBeNull();
  });

  it('ACTIVE sem passada ainda: avisa que o motor não rodou, sem inventar horário', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: null, lastRunMessagesSent: null, lastRunPendingReview: null },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Ainda sem passada do motor.');
  });

  it('ACTIVE com passada hoje: mostra "hoje" e mensagens enviadas', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: '2026-08-22T10:00:00-03:00', lastRunMessagesSent: 3, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada hoje às 10:00 · 3 mensagens enviadas');
  });

  it('ACTIVE com zero mensagens: mostra "0 mensagens enviadas", não some a linha', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: '2026-08-22T10:00:00-03:00', lastRunMessagesSent: 0, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada hoje às 10:00 · 0 mensagens enviadas');
  });

  it('ACTIVE com 1 mensagem: singular', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: '2026-08-22T10:00:00-03:00', lastRunMessagesSent: 1, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada hoje às 10:00 · 1 mensagem enviada');
  });

  it('ACTIVE com passada ontem: mostra "ontem"', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: '2026-08-21T07:00:00-03:00', lastRunMessagesSent: 2, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada ontem às 07:00 · 2 mensagens enviadas');
  });

  it('ACTIVE com passada há vários dias: mostra DD/MM', () => {
    const result = formatRunSummary(
      { status: 'ACTIVE', lastRunAt: '2026-08-10T07:00:00-03:00', lastRunMessagesSent: 5, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada 10/08 às 07:00 · 5 mensagens enviadas');
  });

  it('PAUSED usa o carimbo de antes de pausar, com prefixo próprio', () => {
    const result = formatRunSummary(
      { status: 'PAUSED', lastRunAt: '2026-08-22T07:00:00-03:00', lastRunMessagesSent: 4, lastRunPendingReview: 0 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Antes de pausar, última passada hoje às 07:00 · 4 mensagens enviadas');
  });

  it('REVIEW conta passos em revisão, nunca "mensagens enviadas" — a régua não envia nada', () => {
    const result = formatRunSummary(
      { status: 'REVIEW', lastRunAt: '2026-08-22T07:00:00-03:00', lastRunMessagesSent: 0, lastRunPendingReview: 12 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada hoje às 07:00 · calculou 12 passos em revisão');
  });

  it('REVIEW com 1 passo: singular', () => {
    const result = formatRunSummary(
      { status: 'REVIEW', lastRunAt: '2026-08-22T07:00:00-03:00', lastRunMessagesSent: 0, lastRunPendingReview: 1 },
      TZ,
      new Date('2026-08-22T12:00:00-03:00'),
    );
    expect(result).toBe('Última passada hoje às 07:00 · calculou 1 passo em revisão');
  });
});
