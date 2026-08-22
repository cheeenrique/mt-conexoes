import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';

export function Header({
  title,
  icon,
  primaryAction,
  onOpenMenu,
}: {
  title: string;
  /**
   * Ícone da tela, ao lado do título (README §Header). Chega **renderizado**
   * (`icon={<Users size={22} />}`), não como componente: `AppShell` é client
   * component e um Server Component não consegue passar função por prop —
   * o React derruba a árvore para render no cliente e loga
   * "Functions cannot be passed directly to Client Components".
   */
  icon?: ReactNode;
  primaryAction?: ReactNode;
  /** Abre a gaveta da sidebar. Só existe abaixo de 900px — ver `md:hidden`. */
  onOpenMenu?: () => void;
}) {
  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onOpenMenu && (
          <button
            type="button"
            aria-label="Abrir menu"
            title="Abrir menu"
            onClick={onOpenMenu}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border text-foreground md:hidden"
          >
            <Menu size={18} />
          </button>
        )}
        {icon && (
          <span className="shrink-0 text-foreground" aria-hidden>
            {icon}
          </span>
        )}
        <h1 className="truncate text-2xl font-bold tracking-[-0.02em] text-foreground">{title}</h1>
      </div>
      {primaryAction}
    </header>
  );
}
