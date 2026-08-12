import { describe, expect, it } from 'vitest';
import { resolveDueDateBucket, DUE_DATE_BUCKETS } from './due-date-buckets';

const TZ = 'America/Sao_Paulo';
const NOW = new Date('2026-08-15T15:00:00.000Z'); // 15/08 local

/** Devolve um `dueAt` tal que `daysFromDue(dueAt, NOW, TZ) === offset` — mesma convenção
 *  de sinal de `daysFromDue`: offset negativo = due no futuro (a vencer), positivo = due
 *  no passado (atrasada). Por isso é `NOW - offset`, não `NOW + offset`. */
function dueAtOffset(offset: number): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - offset);
  return d;
}

describe('resolveDueDateBucket — boundaries', () => {
  it('offset -4 (exactly on the D-5/D-2 boundary) resolves D-5', () => {
    expect(resolveDueDateBucket(dueAtOffset(-4), NOW, TZ)).toBe('D-5');
  });

  it('offset -3 (one past the boundary) resolves D-2', () => {
    expect(resolveDueDateBucket(dueAtOffset(-3), NOW, TZ)).toBe('D-2');
  });

  it('offset -1 (last day before due) resolves D-2', () => {
    expect(resolveDueDateBucket(dueAtOffset(-1), NOW, TZ)).toBe('D-2');
  });

  it('offset 0 (due today) resolves D0', () => {
    expect(resolveDueDateBucket(dueAtOffset(0), NOW, TZ)).toBe('D0');
  });

  it('offset 1 (one day late) resolves D+1', () => {
    expect(resolveDueDateBucket(dueAtOffset(1), NOW, TZ)).toBe('D+1');
  });

  it('offset 2 (still within D+1) resolves D+1', () => {
    expect(resolveDueDateBucket(dueAtOffset(2), NOW, TZ)).toBe('D+1');
  });

  it('offset 3 (crosses into D+3) resolves D+3', () => {
    expect(resolveDueDateBucket(dueAtOffset(3), NOW, TZ)).toBe('D+3');
  });

  it('offset 4 (last day of D+3) resolves D+3', () => {
    expect(resolveDueDateBucket(dueAtOffset(4), NOW, TZ)).toBe('D+3');
  });

  it('offset 5 (crosses into the D+5 catch-all) resolves D+5', () => {
    expect(resolveDueDateBucket(dueAtOffset(5), NOW, TZ)).toBe('D+5');
  });
});

describe('resolveDueDateBucket — far catch-alls, nothing falls through', () => {
  it('30 days overdue still resolves D+5, not undefined', () => {
    expect(resolveDueDateBucket(dueAtOffset(30), NOW, TZ)).toBe('D+5');
  });

  it('30 days in the future still resolves D-5, not undefined', () => {
    expect(resolveDueDateBucket(dueAtOffset(-30), NOW, TZ)).toBe('D-5');
  });
});

describe('DUE_DATE_BUCKETS', () => {
  it('has exactly the 6 buckets, in display order', () => {
    expect(DUE_DATE_BUCKETS).toEqual(['D-5', 'D-2', 'D0', 'D+1', 'D+3', 'D+5']);
  });
});
