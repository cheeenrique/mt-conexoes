import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * `<select>` nativo com a altura de 44px e os tokens do handoff (README
 * §"Espaçamento, raio e alturas"). Promovido para `components/ui/` depois da
 * terceira cópia do mesmo `className` em formulário de drawer — sem domínio,
 * recebe tudo por prop.
 */
export function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      data-slot="select"
      className={cn(
        'h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground',
        'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        'aria-invalid:border-destructive',
        className,
      )}
      {...props}
    />
  );
}
