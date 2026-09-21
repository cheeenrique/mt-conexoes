import { describe, expect, it } from 'vitest';
import { eventSummary } from './event-summary';

describe('eventSummary', () => {
  it('mudança de status vem em pt-BR, não no enum cru do Prisma', () => {
    const summary = eventSummary({
      kind: 'SUBSCRIPTION_STATUS_CHANGED',
      before: { status: 'ACTIVE' },
      after: { status: 'SUSPENDED' },
    });

    expect(summary).toBe('Ativa → Suspensa');
  });

  it('cancelamento de cobrança traduz os dois lados pelo mapa de status da cobrança', () => {
    const summary = eventSummary({
      kind: 'CHARGE_CANCELLED',
      before: { status: 'OVERDUE' },
      after: { status: 'CANCELLED' },
    });

    expect(summary).toBe('Vencida → Cancelada');
  });

  it('mudança de ciclo vem em pt-BR, não em MONTHLY/QUARTERLY cru', () => {
    const summary = eventSummary({
      kind: 'SUBSCRIPTION_CYCLE_CHANGED',
      before: { cycle: 'QUARTERLY' },
      after: { cycle: 'MONTHLY' },
    });

    expect(summary).toBe('Trimestral → Mensal');
  });

  it('mudança de vencimento reformata YYYY-MM-DD para DD/MM/YYYY sem reconverter fuso', () => {
    const summary = eventSummary({
      kind: 'SUBSCRIPTION_DUE_DATE_EDITED',
      before: { nextDueAt: '2026-10-10' },
      after: { nextDueAt: '2026-11-10' },
    });

    expect(summary).toBe('10/10/2026 → 10/11/2026');
  });
});
