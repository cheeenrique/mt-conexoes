'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Receipt, SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { daysFromDue } from '@/core/dunning-rules';
import { formatCents, formatLocalDate } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import { ChargeRowActions } from './charge-row-actions';
import { RegisterPaymentDialog } from './register-payment-dialog';
import type { ChargeDTO } from '../queries';

const FILTER_KEYS = ['status', 'customerId', 'supplierId', 'dueFrom', 'dueTo'];

/** "3 dias" de atraso, ou vazio quando não há (não vencida, ou já resolvida). */
function formatOverdue(row: ChargeDTO, timezone: string): string {
  if (row.status === 'PAID' || row.status === 'CANCELLED') return '';
  const days = daysFromDue(new Date(row.dueAt), new Date(), timezone);
  if (days <= 0) return '';
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

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
  const [paying, setPaying] = useState<ChargeDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function loadMore() {
    if (!nextCursor) return;
    const params = new URLSearchParams(searchParams);
    params.set('cursor', nextCursor);
    router.push(`/charges?${params.toString()}`);
  }

  function openPaymentDialog(charge: ChargeDTO) {
    setPaying(charge);
    setDialogOpen(true);
  }

  const hasActiveFilters = FILTER_KEYS.some((key) => !!searchParams.get(key));

  if (rows.length === 0) {
    return hasActiveFilters ? (
      <EmptyState
        icon={SearchX}
        title="Nenhuma cobrança encontrada com esse filtro"
        description="Ajuste os filtros para ver outras cobranças."
      />
    ) : (
      <EmptyState
        icon={Receipt}
        title="Nenhuma cobrança ainda"
        description="Cobranças nascem sozinhas do ciclo da assinatura — aguarde a próxima geração."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="max-h-[480px] overflow-x-auto overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Cliente</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Fornecedor</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Valor</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Pago</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Vencimento</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Atraso</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-foreground-muted">Situação</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-foreground-muted">Ações</th>
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
                <td className="px-4 text-right font-mono text-sm tabular-mono">{formatOverdue(row, timezone)}</td>
                <td className="px-4 text-left text-sm">
                  <ChargeStatusBadge status={row.status} />
                </td>
                <td className="px-4 text-right text-sm">
                  <ChargeRowActions charge={row} onRegisterPayment={openPaymentDialog} />
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
      <p className="border-t border-border px-4 py-2.5 text-xs text-foreground-muted">
        Cobrança paga ou cancelada não é editável. Correção é registro novo.
      </p>
      <RegisterPaymentDialog charge={paying} open={dialogOpen} onOpenChange={setDialogOpen} timezone={timezone} />
    </div>
  );
}
