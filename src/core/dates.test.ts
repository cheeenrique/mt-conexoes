import { describe, expect, it } from 'vitest';
import { daysBetweenLocalDates, endOfLocalDay, firstDueDate, localDateOnly, monthBoundsUtc, nextDueDate, resolveDueDay } from './dates';

const TZ = 'America/Sao_Paulo';

describe('resolveDueDay', () => {
  it('dia 31 em fevereiro comum vira 28', () => {
    expect(resolveDueDay(31, 2026, 1)).toBe(28); // month is 0-indexed: 1 = fevereiro
  });

  it('dia 31 em fevereiro bissexto vira 29', () => {
    expect(resolveDueDay(31, 2028, 1)).toBe(29);
  });

  it('dia 15 nunca muda', () => {
    expect(resolveDueDay(15, 2026, 1)).toBe(15);
  });
});

describe('nextDueDate — clamp de fim de mês', () => {
  it('pagou 31/01 → vence 28/02 (comum)', () => {
    const due = nextDueDate({ paidAt: new Date('2026-01-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-03-01T02:59:59.999Z'); // 28/02 23:59:59.999 -03:00
  });

  it('pagou 31/01 → vence 29/02 (bissexto 2028)', () => {
    const due = nextDueDate({ paidAt: new Date('2028-01-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2028-03-01T02:59:59.999Z'); // 29/02 23:59:59.999 -03:00
  });

  it('pagou 31/01, trimestral → vence 30/04', () => {
    const due = nextDueDate({ paidAt: new Date('2026-01-31T15:00:00Z'), cycle: 'QUARTERLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-05-01T02:59:59.999Z'); // 30/04 23:59:59.999 -03:00
  });

  it('pagou 28/02, depois pagou 28/03 → mantém dia 28, não sobe pra 31', () => {
    const due = nextDueDate({ paidAt: new Date('2026-03-28T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-04-29T02:59:59.999Z'); // 28/04 23:59:59.999 -03:00
  });

  it('pagou dia 31 em março, ciclo mensal → clampa pra 30 em abril, não "lembra" do 31', () => {
    const due = nextDueDate({ paidAt: new Date('2026-03-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-05-01T02:59:59.999Z'); // 30/04 (abril tem 30 dias, não 31/04)
  });

  it('pagou 28/02 → vence 28/03, não 31/03 (clamp não gruda; usa só o dia do pagamento real)', () => {
    const due = nextDueDate({ paidAt: new Date('2026-02-28T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-03-29T02:59:59.999Z'); // 28/03 23:59:59.999 -03:00
  });

  it('pagou dia 1 → sempre dia 1', () => {
    const due = nextDueDate({ paidAt: new Date('2026-06-01T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-07-02T02:59:59.999Z'); // 01/07 23:59:59.999 -03:00
  });

  it('pagou dia 15 → nunca muda', () => {
    const due = nextDueDate({ paidAt: new Date('2026-05-15T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-06-16T02:59:59.999Z'); // 15/06 23:59:59.999 -03:00
  });

  it('semestral: pagou 31/08 → vence 28/02', () => {
    const due = nextDueDate({ paidAt: new Date('2026-08-31T15:00:00Z'), cycle: 'SEMIANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2027-03-01T02:59:59.999Z');
  });

  it('anual: pagou 29/02/2028 → vence 28/02/2029', () => {
    const due = nextDueDate({ paidAt: new Date('2028-02-29T15:00:00Z'), cycle: 'ANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2029-03-01T02:59:59.999Z');
  });

  it('anual atravessando virada de ano: pagou 15/12/2026 → vence 15/12/2027', () => {
    const due = nextDueDate({ paidAt: new Date('2026-12-15T15:00:00Z'), cycle: 'ANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2027-12-16T02:59:59.999Z');
  });

  it('pagou dia 31 em julho, mensal → mês alvo agosto tem 31 dias → vence 31/08', () => {
    const due = nextDueDate({ paidAt: new Date('2026-07-31T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-09-01T02:59:59.999Z'); // 31/08 23:59:59.999 -03:00
  });

  it('trimestral: pagou 30/04 → vence 30/07, não 31/07', () => {
    const due = nextDueDate({ paidAt: new Date('2026-04-30T15:00:00Z'), cycle: 'QUARTERLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-07-31T02:59:59.999Z'); // 30/07 23:59:59.999 -03:00
  });

  it('semestral: pagou 28/02, depois pagou 28/02 de novo → vence 28/08, não 31/08', () => {
    const due = nextDueDate({ paidAt: new Date('2027-02-28T15:00:00Z'), cycle: 'SEMIANNUAL', timezone: TZ });
    expect(due.toISOString()).toBe('2027-08-29T02:59:59.999Z'); // 28/08 23:59:59.999 -03:00
  });
});

describe('firstDueDate', () => {
  it('assinatura criada 01/01, mensal → primeira cobrança vence 01/02', () => {
    const due = firstDueDate({ startedAt: new Date('2026-01-01T15:00:00Z'), cycle: 'MONTHLY', timezone: TZ });
    expect(due.toISOString()).toBe('2026-02-02T02:59:59.999Z'); // 01/02 23:59:59.999 -03:00
  });
});

describe('fuso — janela de atraso', () => {
  it('vencimento em UTC corresponde a 23:59:59.999 local do dia 10', () => {
    const due = endOfLocalDay(2026, 7, 10, TZ); // agosto = mês 7 (0-indexed)
    expect(due.toISOString()).toBe('2026-08-11T02:59:59.999Z');
  });
});

describe('monthBoundsUtc', () => {
  it('agosto não inclui pagamento de 31/07 22:00 local', () => {
    const { from } = monthBoundsUtc(2026, 7, TZ);
    const payment = new Date('2026-08-01T01:00:00Z'); // 31/07 22:00 -03:00
    expect(payment.getTime() < from.getTime()).toBe(true);
  });

  it('agosto inclui pagamento de 31/08 22:00 local', () => {
    const { from, to } = monthBoundsUtc(2026, 7, TZ);
    const payment = new Date('2026-09-01T01:00:00Z'); // 31/08 22:00 -03:00
    expect(payment.getTime() >= from.getTime() && payment.getTime() < to.getTime()).toBe(true);
  });
});

describe('daysBetweenLocalDates', () => {
  it('vencimento 23:59:59 local de ontem, checado hoje de manhã → 1 dia, não 0', () => {
    // vencimento: 07/08/2026 23:59:59.999 -03:00
    const due = endOfLocalDay(2026, 7, 7, TZ);
    // agora: 08/08/2026 10:00 -03:00 (raw diff seria ~10h, floor daria 0)
    const now = new Date('2026-08-08T13:00:00Z');
    expect(daysBetweenLocalDates(due, now, TZ)).toBe(1);
  });

  it('mesmo dia local → 0 dias', () => {
    const due = endOfLocalDay(2026, 7, 8, TZ);
    const now = new Date('2026-08-08T13:00:00Z'); // 10:00 local do mesmo dia 08
    expect(daysBetweenLocalDates(due, now, TZ)).toBe(0);
  });
});

describe('localDateOnly', () => {
  it('extrai a data local sem componente de hora', () => {
    // 2026-08-10T23:59:59.999Z é 20:59:59 de 10/08 em America/Sao_Paulo (UTC-3)
    const result = localDateOnly(new Date('2026-08-10T23:59:59.999Z'), 'America/Sao_Paulo');
    expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('vira o dia certo quando o instante UTC já passou da meia-noite local do dia seguinte', () => {
    // 2026-08-11T02:00:00.000Z é 23:00 de 10/08 em America/Sao_Paulo — ainda dia 10 local
    const result = localDateOnly(new Date('2026-08-11T02:00:00.000Z'), 'America/Sao_Paulo');
    expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });

  it('é independente do fuso do processo — mesmo resultado sob TZ diferente', () => {
    const original = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const result = localDateOnly(new Date('2026-08-10T23:59:59.999Z'), 'America/Sao_Paulo');
      expect(result.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    } finally {
      process.env.TZ = original;
    }
  });
});
