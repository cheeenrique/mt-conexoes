import { AppShell } from '@/components/layout/app-shell';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback de carregamento do grupo `(app)`. Vale para qualquer tela do painel
 * que não tenha um `loading.tsx` próprio, por isso o esqueleto é neutro
 * (cartão do topo + faixa + tabela) e o título fica vazio: o `AppShell` mantém
 * sidebar e header no lugar, e o título real chega junto com a tela.
 */
export default function Loading() {
  return (
    <AppShell title="">
      <div className="flex flex-col gap-6">
        <Skeleton className="h-[168px] w-full" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[0, 1, 2, 3, 4].map((card) => (
            <Skeleton key={card} className="h-[104px] w-full" />
          ))}
        </div>
        <Skeleton className="h-[196px] w-full" />
        <div className="overflow-hidden rounded border border-border bg-surface">
          <Skeleton className="h-11 w-full rounded-none" />
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="border-t border-border px-4 py-2.5">
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
