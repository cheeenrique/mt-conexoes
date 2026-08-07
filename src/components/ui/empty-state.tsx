import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded border border-border bg-surface p-10 text-center">
      <Icon size={22} className="text-foreground-muted" />
      <p className="text-base font-bold text-foreground">{title}</p>
      <p className="text-sm text-foreground-muted">{description}</p>
      {action}
    </div>
  );
}
