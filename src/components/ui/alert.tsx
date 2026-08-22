import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Mesmo padrão de "fundo translúcido de badge" do README de design
// (rgba(...) por tom) já usado em status-badge.tsx: `bg-{tom}/[opacidade] text-{tom}`.
// Não existe tom "info" na paleta do produto — reaproveita o par brand/brand-light
// que o StatusBadge já usa para o tom "brand" (aviso neutro, não é erro nem sucesso).
const TONE_CLASSES = {
  danger: 'border-danger bg-danger/[.12] text-danger',
  warning: 'border-warning bg-warning/[.14] text-warning',
  success: 'border-success bg-success/[.12] text-success',
  info: 'border-brand bg-brand/[.14] text-brand-light',
  // Sem cor de marca associada — estado "não roda para ninguém" (rascunho da
  // régua) é informativo, não um aviso. Mesmo par de tokens do tom "neutral"
  // do StatusBadge (bg-surface-elevated/text-foreground-muted), com a borda
  // que o banner de rascunho já usava antes da migração para `Alert`.
  neutral: 'border-foreground-muted bg-surface-elevated text-foreground-muted',
} as const;

type AlertTone = keyof typeof TONE_CLASSES;

// `neutral` fica de fora de propósito: rascunho não pede ícone de atenção, e
// nenhum ícone do tom "neutro" está na lista fechada do handoff — melhor não
// ter ícone do que inventar um.
const DEFAULT_ICON: Partial<Record<AlertTone, LucideIcon>> = {
  danger: TriangleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: CircleAlert,
};

export interface AlertProps {
  tone: AlertTone;
  /** Sobrescreve o ícone padrão do tom. `null` remove o ícone. */
  icon?: LucideIcon | null;
  /**
   * `alert` interrompe o leitor de tela — reservado para o que exige reação
   * imediata (ex. erro de formulário). Os demais tons usam `status`, que
   * anuncia sem interromper. Padrão: `alert` só para `tone="danger"`;
   * sobrescrevível quando o caso concreto pede o contrário.
   */
  role?: 'alert' | 'status';
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Alerta encaixado no bloco onde vive (não é toast). Ícone + fundo translúcido
 * do tom + borda esquerda de 2px — a borda esquerda é a única espessa, as
 * demais ficam ausentes. Composição via `children`: quem chama monta título,
 * texto e ações (ex. link, botões) — sem prop dedicada para cada caso.
 */
export function Alert({ tone, icon, role, id, className, children }: AlertProps) {
  const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[tone]);
  const resolvedRole = role ?? (tone === 'danger' ? 'alert' : 'status');

  return (
    <div
      id={id}
      role={resolvedRole}
      className={cn(
        'flex items-start gap-2.5 rounded-lg border-l-2 px-3.5 py-3 text-sm',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {Icon && <Icon aria-hidden="true" size={16} className="mt-0.5 shrink-0" />}
      <div className="flex-1">{children}</div>
    </div>
  );
}
