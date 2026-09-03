'use client';

import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Select } from './select';
import { Skeleton } from './skeleton';
import { DataTableCard } from './data-table-card';
import { PER_PAGE_OPTIONS, type PerPage } from './data-table-paging';


export interface Column<T> {
  header: string;
  align?: 'left' | 'right';
  cell: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  page,
  perPage,
  total,
  onPageChange,
  onPerPageChange,
  emptyState,
  loading = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  page: number;
  perPage: PerPage;
  total: number;
  onPageChange: (page: number) => void;
  onPerPageChange: (perPage: PerPage) => void;
  emptyState: ReactNode;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded border border-border bg-surface">
        {Array.from({ length: perPage }).map((_, i) => (
          <Skeleton key={i} className="m-2 h-8" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <>{emptyState}</>;
  }

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const canPrev = page > 1;
  const canNext = to < total;
  // README §Padrão de tabela: a tabela mostra até 20 itens por página, mas a
  // altura visível fica fixa em ~10 linhas — acima disso rola dentro do card
  // em vez de esticar a página. Fixo, não `perPage * 44` — antes a altura
  // crescia junto com o `perPage` e uma página de 20 nunca chegava a rolar.
  const VISIBLE_ROWS = 10;
  const tableScrollStyle = rows.length > VISIBLE_ROWS ? { maxHeight: VISIBLE_ROWS * 44 + 44 } : undefined;

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="md:hidden">
        {rows.map((row) => (
          <DataTableCard key={rowKey(row)} columns={columns} row={row} />
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block" style={tableScrollStyle && { ...tableScrollStyle, overflowY: 'auto' }}>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col, index) => (
                <th
                  key={index}
                  className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="h-11 border-b border-border last:border-0">
                {columns.map((col, index) => (
                  <td
                    key={index}
                    className={`px-4 text-sm ${col.align === 'right' ? 'text-right font-mono tabular-mono' : 'text-left'}`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
        <span className="font-mono text-xs tabular-mono text-foreground-muted">
          {from}–{to} de {total}
        </span>
        <div className="flex items-center gap-3">
          <Select
            aria-label="Por página"
            value={String(perPage)}
            onValueChange={(next) => {
              const value = Number(next);
              if ((PER_PAGE_OPTIONS as readonly number[]).includes(value)) {
                onPerPageChange(value as PerPage);
              }
            }}
            className="h-11 w-20 rounded-badge px-2 text-xs md:h-8"
            options={PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
          />
          <button
            type="button"
            aria-label="Página anterior"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            className="flex h-11 w-11 items-center justify-center rounded-badge border border-border disabled:opacity-40 md:h-8 md:w-8"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label="Próxima página"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-badge border border-border disabled:opacity-40 md:h-8 md:w-8"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
