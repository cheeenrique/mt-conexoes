import Decimal from 'decimal.js';
import { classifyMarginTone, type MarginTone } from '@/core/money';

export type { MarginTone };

function toDecimal(margin: string | Decimal | null): Decimal | null {
  if (margin === null) return null;
  return margin instanceof Decimal ? margin : new Decimal(margin);
}

const BADGE_TONE: Record<MarginTone, 'success' | 'warning' | 'danger'> = {
  healthy: 'success',
  tight: 'warning',
  critical: 'danger',
};

/** Tom do `StatusBadge` para uma margem — régua fixa de `classifyMarginTone`. */
export function marginBadgeTone(margin: string | Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  const tone = classifyMarginTone(toDecimal(margin));
  return tone === null ? 'neutral' : BADGE_TONE[tone];
}

const TEXT_CLASS: Record<MarginTone, string> = {
  healthy: 'text-success',
  tight: 'text-warning',
  critical: 'text-danger',
};

/** Classe Tailwind de texto para uma margem — mesma régua de `classifyMarginTone`. */
export function marginToneClass(margin: string | Decimal | null): string {
  const tone = classifyMarginTone(toDecimal(margin));
  return tone === null ? 'text-foreground-muted' : TEXT_CLASS[tone];
}
