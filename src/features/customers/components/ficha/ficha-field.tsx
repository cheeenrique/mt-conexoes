import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

/**
 * Rótulo + campo + erro, na altura de 44px do handoff. Nasceu aqui, na terceira
 * repetição do mesmo bloco dentro dos três cartões do modo edição.
 */
export function FichaField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-foreground-muted">{hint}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
