import type { Column } from './data-table';

/**
 * Fallback do padrão de tabela abaixo de 900px (README §Padrão de tabela):
 * a mesma linha vira um cartão empilhado, mesmos dados.
 *
 * Convenção genérica, sem conhecer o domínio da tela: a primeira coluna
 * (normalmente nome + apoio, já composta pela própria tela) fica em
 * destaque; colunas do meio viram pares rótulo/valor; a última coluna, só
 * quando sem cabeçalho, é tratada como a coluna de ações do padrão de
 * tabela e ganha uma linha própria alinhada à direita.
 */
export function DataTableCard<T>({ columns, row }: { columns: Column<T>[]; row: T }) {
  return (
    <div className="border-b border-border p-4 last:border-0">
      {columns.map((col, index) => {
        const isLast = index === columns.length - 1;
        if (col.header === '' && isLast) {
          return (
            <div key={index} className="mt-3 flex items-center justify-end gap-1.5">
              {col.cell(row)}
            </div>
          );
        }
        if (index === 0) {
          return (
            <div key={index} className="text-sm font-semibold text-foreground">
              {col.cell(row)}
            </div>
          );
        }
        return (
          <div key={index} className="mt-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-foreground-muted">{col.header}</span>
            <span
              className={
                col.align === 'right' ? 'font-mono tabular-mono text-foreground' : 'text-foreground'
              }
            >
              {col.cell(row)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
