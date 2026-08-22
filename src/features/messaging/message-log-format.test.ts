import { describe, expect, it } from 'vitest';
import {
  formatLocalDayHeading,
  formatLocalTime,
  groupByLocalDay,
  isPostponed,
  outcomeBadge,
  reasonText,
  resolvePeriodBounds,
  stepLabel,
  stepLabels,
  summarize,
  type MessageLogEntryDTO,
} from './message-log-format';

const TZ = 'America/Sao_Paulo';

function entry(overrides: Partial<MessageLogEntryDTO> = {}): MessageLogEntryDTO {
  return {
    id: 'e1',
    source: 'MESSAGE',
    occurredAt: '2026-08-08T12:03:00.000Z',
    customerId: 'c1',
    customerName: 'Cláudia Nunes',
    origin: 'RULE',
    stepLabel: 'D0',
    outcome: 'SENT',
    postponed: false,
    postponedToAt: null,
    reasonCode: null,
    failReason: null,
    body: 'Olá!',
    ...overrides,
  };
}

describe('stepLabel', () => {
  it('escreve D0 no dia do vencimento', () => {
    expect(stepLabel(0)).toBe('D0');
  });

  it('escreve D-5 antes do vencimento e D+3 depois', () => {
    expect(stepLabel(-5)).toBe('D-5');
    expect(stepLabel(3)).toBe('D+3');
  });
});

describe('stepLabels', () => {
  it('devolve null quando a mensagem não veio de passo nenhum', () => {
    expect(stepLabels([])).toBeNull();
  });

  it('mostra o passo mais adiantado e conta os demais quando a mensagem foi consolidada', () => {
    expect(stepLabels([3, -2, 0])).toBe('D-2 +2');
  });
});

describe('isPostponed', () => {
  it('não considera adiada a mensagem cujo scheduledFor nasceu junto com o createdAt', () => {
    // `persistConsolidatedMessage` grava scheduledFor = now e o banco carimba
    // createdAt milissegundos depois: diferença de relógio, não adiamento.
    const createdAt = new Date('2026-08-08T12:00:00.400Z');
    const scheduledFor = new Date('2026-08-08T12:00:00.000Z');
    expect(isPostponed(scheduledFor, createdAt)).toBe(false);
  });

  it('considera adiada quando a quiet hour empurrou o scheduledFor pra frente', () => {
    const createdAt = new Date('2026-08-08T00:10:00.000Z');
    const scheduledFor = new Date('2026-08-08T11:00:00.000Z');
    expect(isPostponed(scheduledFor, createdAt)).toBe(true);
  });
});

describe('outcomeBadge', () => {
  it('separa adiada de pulada — são coisas diferentes', () => {
    expect(outcomeBadge(entry({ outcome: 'PENDING', postponed: true })).label).toBe('Adiada');
    expect(outcomeBadge(entry({ outcome: 'PENDING', postponed: false })).label).toBe('Na fila');
    expect(outcomeBadge(entry({ outcome: 'SKIPPED' })).label).toBe('Pulada');
  });

  it('usa verde pra enviada e vermelho pra falha', () => {
    expect(outcomeBadge(entry({ outcome: 'SENT' })).tone).toBe('success');
    expect(outcomeBadge(entry({ outcome: 'FAILED' })).tone).toBe('danger');
  });
});

describe('reasonText', () => {
  it('traduz o motivo de pulo do job para linguagem humana', () => {
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'opted_out' }))).toBe('cliente pediu para sair');
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'daily_dedupe' }))).toBe('já recebeu mensagem hoje');
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'charge_closed' }))).toBe('cliente já pagou');
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'no_phone' }))).toBe('cliente sem telefone');
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'stale' }))).toBe('parada há mais de 24h na fila');
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'review' }))).toBe('régua em revisão');
  });

  it('mostra o código cru quando o job gravou um motivo que a tela não conhece', () => {
    // Inventar um texto aqui esconderia divergência entre job e tela.
    expect(reasonText(entry({ outcome: 'SKIPPED', reasonCode: 'motivo_novo' }))).toBe('motivo_novo');
  });

  it('usa o texto do provedor na falha', () => {
    expect(reasonText(entry({ outcome: 'FAILED', failReason: 'Instância Evolution desconectada' }))).toBe(
      'Instância Evolution desconectada',
    );
  });

  it('explica a espera da mensagem adiada e da que está na fila', () => {
    expect(reasonText(entry({ outcome: 'PENDING', postponed: true }))).toBe('fora do horário de envio');
    expect(reasonText(entry({ outcome: 'PENDING', postponed: false }))).toBe('aguardando o próximo envio');
  });

  it('não inventa motivo para mensagem enviada', () => {
    expect(reasonText(entry({ outcome: 'SENT' }))).toBeNull();
  });
});

describe('formatLocalTime', () => {
  it('mostra a hora no fuso do negócio, não no do navegador', () => {
    expect(formatLocalTime('2026-08-08T12:03:00.000Z', TZ)).toBe('09:03');
  });
});

describe('formatLocalDayHeading', () => {
  it('escreve o dia no fuso do negócio', () => {
    // 03:00Z de 09/08 ainda é 08/08 em São Paulo.
    expect(formatLocalDayHeading('2026-08-09T02:00:00.000Z', TZ)).toContain('08/08');
  });
});

describe('groupByLocalDay', () => {
  it('agrupa pelo dia local e mantém o dia mais recente primeiro', () => {
    const groups = groupByLocalDay(
      [
        entry({ id: 'a', occurredAt: '2026-08-08T12:00:00.000Z' }),
        entry({ id: 'b', occurredAt: '2026-08-09T02:00:00.000Z' }), // ainda 08/08 local
        entry({ id: 'c', occurredAt: '2026-08-09T12:00:00.000Z' }),
      ],
      TZ,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].dayKey).toBe('2026-08-09');
    expect(groups[1].dayKey).toBe('2026-08-08');
    expect(groups[1].entries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('ordena as linhas do dia da mais recente para a mais antiga', () => {
    const groups = groupByLocalDay(
      [
        entry({ id: 'cedo', occurredAt: '2026-08-08T12:00:00.000Z' }),
        entry({ id: 'tarde', occurredAt: '2026-08-08T20:00:00.000Z' }),
      ],
      TZ,
    );

    expect(groups[0].entries.map((e) => e.id)).toEqual(['tarde', 'cedo']);
  });
});

describe('summarize', () => {
  it('conta cada situação separadamente', () => {
    const totals = summarize([
      entry({ outcome: 'SENT' }),
      entry({ outcome: 'SENT' }),
      entry({ outcome: 'SKIPPED' }),
      entry({ outcome: 'FAILED' }),
      entry({ outcome: 'PENDING' }),
    ]);

    expect(totals).toEqual({ total: 5, sent: 2, skipped: 1, failed: 1, pending: 1 });
  });
});

describe('resolvePeriodBounds', () => {
  const now = new Date('2026-08-08T12:00:00.000Z'); // 09:00 de 08/08 em São Paulo

  it('hoje começa na meia-noite local e termina às 23:59:59 local', () => {
    const { from, to } = resolvePeriodBounds('today', now, TZ);
    expect(from?.toISOString()).toBe('2026-08-08T03:00:00.000Z');
    expect(to?.toISOString()).toBe('2026-08-09T02:59:59.999Z');
  });

  it('7 dias inclui hoje e os 6 anteriores', () => {
    const { from } = resolvePeriodBounds('7d', now, TZ);
    expect(from?.toISOString()).toBe('2026-08-02T03:00:00.000Z');
  });

  it('30 dias inclui hoje e os 29 anteriores, atravessando a virada de mês', () => {
    const { from } = resolvePeriodBounds('30d', now, TZ);
    expect(from?.toISOString()).toBe('2026-07-10T03:00:00.000Z');
  });

  it('tudo não impõe limite nenhum', () => {
    expect(resolvePeriodBounds('all', now, TZ)).toEqual({ from: undefined, to: undefined });
  });
});
