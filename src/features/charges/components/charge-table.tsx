'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import type { ChargeDTO } from '../queries';

export function ChargeTable({
  rows,
  nextCursor,
  timezone,
}: {
  rows: ChargeDTO[];
  nextCursor: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams);
    params.set('cursor', nextCursor);
    router.push(`/charges?${params.toString()}`);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nenhuma cobrança encontrada"
        description="Ajuste os filtros ou aguarde a próxima geração do ciclo."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Cliente</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Fornecedor</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Valor</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Pago</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Vencimento</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="h-11 border-b border-border last:border-0">
                <td className="px-4 text-left text-sm">
                  <Link href={`/customers/${row.customerId}`} className="font-semibold text-foreground hover:text-brand">
                    {row.customerName}
                  </Link>
                </td>
                <td className="px-4 text-left text-sm">{row.supplierName ?? '—'}</td>
                <td className="px-4 text-right font-mono text-sm tabular-mono">{formatCents(row.netCents)}</td>
                <td className="px-4 text-right font-mono text-sm tabular-mono">{formatCents(row.paidCents)}</td>
                <td className="px-4 text-right font-mono text-sm tabular-mono">{formatLocalDate(row.dueAt, timezone)}</td>
                <td className="px-4 text-left text-sm">
                  <ChargeStatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nextCursor && (
        <div className="flex items-center justify-center border-t border-border py-2.5">
          <button
            type="button"
            onClick={loadMore}
            className="h-8 rounded-sm border border-border px-3 text-xs font-semibold text-foreground-muted"
          >
            Carregar mais
          </button>
        </div>
      )}
    </div>
  );
}
