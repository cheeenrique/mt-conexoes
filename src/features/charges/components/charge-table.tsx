'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Receipt, SearchX } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { daysFromDue } from '@/core/dunning-rules';
import { formatCents, formatLocalDate, formatPhoneBR } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import { ChargeRowActions } from './charge-row-actions';
import { RegisterPaymentDialog } from './register-payment-dialog';
import type { ChargeDTO } from '../queries';
import type { PerPage } from '@/components/ui/data-table-paging';

/** "3 dias" de atraso, ou vazio quando não há (não vencida, ou já resolvida). */
function formatOverdue(row: ChargeDTO, timezone: string): string {
  if (row.status === 'PAID' || row.status === 'CANCELLED') return '';
  const days = daysFromDue(new Date(row.dueAt), new Date(), timezone);
  if (days <= 0) return '';
  return `${days} ${days === 1 ? 'dia' : 'dias'}`;
}

export function ChargeTable({
  rows,
  total,
  page,
  perPage,
  filtered,
  timezone,
}: {
  rows: ChargeDTO[];
  total: number;
  page: number;
  perPage: PerPage;
  /** Há busca ou filtro aplicado — muda o vazio de "sem dados" para "sem resultado". */
  filtered: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paying, setPaying] = useState<ChargeDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    if (key !== 'page') params.delete('page');
    router.push(`/charges?${params.toString()}`);
  }

  function openPaymentDialog(charge: ChargeDTO) {
    setPaying(charge);
    setDialogOpen(true);
  }

  const columns: Column<ChargeDTO>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <Link href={`/customers/${row.customerId}`} className="text-sm font-semibold text-foreground hover:text-brand">
            {row.customerName}
          </Link>
          <p className="font-mono text-xs tabular-mono text-foreground-muted">
            {row.customerPhone ? formatPhoneBR(row.customerPhone) : '—'}
          </p>
        </div>
      ),
    },
    { header: 'Fornecedor', cell: (row) => row.supplierName ?? '—' },
    { header: 'Valor', align: 'right', cell: (row) => formatCents(row.netCents) },
    { header: 'Pago', align: 'right', cell: (row) => formatCents(row.paidCents) },
    { header: 'Vencimento', align: 'right', cell: (row) => formatLocalDate(row.dueAt, timezone) },
    { header: 'Atraso', align: 'right', cell: (row) => formatOverdue(row, timezone) },
    { header: 'Situação', cell: (row) => <ChargeStatusBadge status={row.status} /> },
    // Cabeçalho vazio na última coluna: é assim que o cartão do mobile
    // reconhece a coluna de ações (ver DataTableCard).
    { header: '', align: 'right', cell: (row) => <ChargeRowActions charge={row} onRegisterPayment={openPaymentDialog} /> },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={(next) => setParam('page', String(next))}
        onPerPageChange={(next) => setParam('perPage', String(next))}
        emptyState={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="Nenhuma cobrança encontrada com esse filtro"
              description="Ajuste a busca ou os filtros para ver outras cobranças."
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Nenhuma cobrança ainda"
              description="Cobranças nascem sozinhas do ciclo da assinatura — aguarde a próxima geração."
            />
          )
        }
      />
      {rows.length > 0 && (
        <p className="mt-2 text-xs text-foreground-muted">
          Cobrança paga ou cancelada não é editável. Correção é registro novo.
        </p>
      )}
      <RegisterPaymentDialog charge={paying} open={dialogOpen} onOpenChange={setDialogOpen} timezone={timezone} />
    </>
  );
}
