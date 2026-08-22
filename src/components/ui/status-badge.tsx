import type { ReactNode } from 'react';

const TONE_CLASSES = {
  success: 'bg-success/[.12] text-success',
  warning: 'bg-warning/[.14] text-warning',
  danger: 'bg-danger/[.12] text-danger',
  neutral: 'bg-surface-elevated text-foreground-muted',
  brand: 'bg-brand/[.14] text-brand-light',
} as const;

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONE_CLASSES;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-badge px-2 text-xs font-bold ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
