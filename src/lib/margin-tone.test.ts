import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { marginBadgeTone, marginToneClass } from './margin-tone';

describe('marginBadgeTone', () => {
  it('aceita Decimal', () => {
    expect(marginBadgeTone(new Decimal('64'))).toBe('success');
    expect(marginBadgeTone(new Decimal('20'))).toBe('warning');
    expect(marginBadgeTone(new Decimal('2'))).toBe('danger');
  });

  it('aceita string, mesma régua', () => {
    expect(marginBadgeTone('40')).toBe('success');
    expect(marginBadgeTone('39.99')).toBe('warning');
    expect(marginBadgeTone('15')).toBe('warning');
    expect(marginBadgeTone('14.99')).toBe('danger');
  });

  it('sem receita é neutro', () => {
    expect(marginBadgeTone(null)).toBe('neutral');
  });
});

describe('marginToneClass', () => {
  it('classe acompanha a faixa, e sem receita fica neutra', () => {
    expect(marginToneClass(new Decimal('64'))).toBe('text-success');
    expect(marginToneClass(new Decimal('20'))).toBe('text-warning');
    expect(marginToneClass(new Decimal('2'))).toBe('text-danger');
    expect(marginToneClass(null)).toBe('text-foreground-muted');
  });
});
