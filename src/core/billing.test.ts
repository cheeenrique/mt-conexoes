import { describe, expect, it } from 'vitest';
import { deriveChargeStatus } from './billing';

const DUE = new Date('2026-08-10T23:59:59.999Z'); // 23:59:59 local já em UTC

describe('deriveChargeStatus', () => {
  it('sem pagamento e antes do vencimento é OPEN', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('OPEN');
  });

  it('sem pagamento e depois do vencimento é OVERDUE', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento parcial antes do vencimento é PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PARTIALLY_PAID');
  });

  it('pagamento parcial depois do vencimento é OVERDUE, não PARTIALLY_PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 4_000n, dueAt: DUE, now: new Date('2026-08-11T00:00:01Z') });
    expect(status).toBe('OVERDUE');
  });

  it('pagamento igual ao net é PAID, mesmo depois do vencimento', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_000n, dueAt: DUE, now: new Date('2026-09-01T00:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('pagamento acima do net (não deveria acontecer, mas não quebra) ainda é PAID', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 10_500n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('cobrança de 0 centavos com 0 pago é PAID, não OPEN (nada a cobrar)', () => {
    const status = deriveChargeStatus({ netCents: 0n, paidCents: 0n, dueAt: DUE, now: new Date('2026-08-05T12:00:00Z') });
    expect(status).toBe('PAID');
  });

  it('vencimento exatamente igual a now ainda não é OVERDUE (dueAt é inclusive)', () => {
    const status = deriveChargeStatus({ netCents: 10_000n, paidCents: 0n, dueAt: DUE, now: DUE });
    expect(status).toBe('OPEN');
  });
});
