'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Receipt, SearchX } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCents, formatLocalDate, formatPhoneBR } from '@/lib/format';
import { ChargeStatusBadge } from './charge-status-badge';
import { ChargeRowActions } from './charge-row-actions';
import { RegisterPaymentDialog } from './register-payment-dialog';
import type { ChargeDTO } from '../queries';

export type PerPage = 8 | 12 | 20;

export function OpenChargesTable({
  rows,
  totalOpenCount,
  cardLabel,
  page,
  perPage,
  timezone,
  isFiltered,
}: {
  /** Já filtradas pelo balde selecionado, na ordem de vencimento. */
  rows: ChargeDTO[];
  totalOpenCount: number;
  cardLabel: string;
  page: number;
  perPage: PerPage;
  timezone: string;
  isFiltered: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [paying, setPaying] = useState<ChargeDTO | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function openPaymentDialog(charge: ChargeDTO) {
    setPaying(charge);
    setDialogOpen(true);
  }

  // Paginação vive na URL (regra 04-frontend): o operador compartilha link e
  // volta pelo histórico sem perder onde estava.
  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    mutate(params);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const columns: Column<ChargeDTO>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <>
          <Link href={`/customers/${row.customerId}`} className="font-semibold text-foreground hover:text-brand">
            {row.customerName}
          </Link>
          <p className="font-mono text-xs tabular-mono text-foreground-muted">{row.customerPhone ? formatPhoneBR(row.customerPhone) : '—'}</p>
        </>
      ),
    },
    { header: 'Situação', cell: (row) => <ChargeStatusBadge status={row.status} /> },
    { header: 'Vencimento', align: 'right', cell: (row) => formatLocalDate(row.dueAt, timezone) },
    {
      header: 'Valor',
      align: 'right',
      // Valor congelado na emissão, menos o que já entrou. Nunca recalculado do plano.
      cell: (row) => (
        <span className="font-semibold">{formatCents(BigInt(row.netCents) - BigInt(row.paidCents))}</span>
      ),
    },
    // Cabeçalho vazio na última coluna: é assim que o cartão do mobile
    // reconhece a coluna de ações (ver DataTableCard).
    { header: '', align: 'right', cell: (row) => <ChargeRowActions charge={row} onRegisterPayment={openPaymentDialog} /> },
  ];

  const pageRows = rows.slice((page - 1) * perPage, page * perPage);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[13px] font-semibold uppercase tracking-[.06em] text-foreground-muted">{cardLabel}</p>
        <p className="font-mono text-xs tabular-mono text-foreground-muted">
          {rows.length} de {totalOpenCount}
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(row) => row.id}
        page={page}
        perPage={perPage}
        total={rows.length}
        onPageChange={(next) => pushParams((params) => params.set('page', String(next)))}
        onPerPageChange={(next) =>
          pushParams((params) => {
            params.set('perPage', String(next));
            params.delete('page');
          })
        }
        emptyState={
          isFiltered ? (
            <EmptyState
              icon={SearchX}
              title="Nenhuma cobrança nesta coluna"
              description="Clique na coluna selecionada da faixa acima para ver todas as cobranças em aberto."
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="Nada em aberto — está tudo recebido"
              description="Cobranças nascem sozinhas do ciclo da assinatura. A próxima aparece aqui quando for emitida."
            />
          )
        }
      />

      <RegisterPaymentDialog charge={paying} open={dialogOpen} onOpenChange={setDialogOpen} timezone={timezone} />
    </section>
  );
}
