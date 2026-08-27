'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox, MessageCircle, SearchX, UserPlus, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { LeadDrawer } from './lead-drawer';
import { LeadStatusBadge } from './lead-status-badge';
import { formatPhoneBR, whatsAppUrl } from '@/lib/format';
import { relativeWhen } from '../when';
import type { LeadListRowDTO } from '../queries';
import type { ConvertLead, FindCustomerByPhone } from '../convert-types';
import type { ConvertPlanOption, ConvertSupplierOption } from './convert-options';
import type { PerPage } from '@/components/ui/data-table-paging';

export function LeadTable({
  rows,
  total,
  page,
  perPage,
  filtered,
  nowIso,
  timezone,
  plans,
  suppliers,
  convertLead,
  checkPhone,
}: {
  rows: LeadListRowDTO[];
  total: number;
  page: number;
  perPage: PerPage;
  /** Há busca ou chip aplicado — separa "nenhum lead ainda" de "o filtro não achou". */
  filtered: boolean;
  /** Instante resolvido no servidor: "há 2 horas" precisa render determinístico. */
  nowIso: string;
  timezone: string;
  /** Listas e ação de conversão descem de `app/`: a feature não cruza fronteira. */
  plans: ConvertPlanOption[];
  suppliers: ConvertSupplierOption[];
  convertLead: ConvertLead;
  checkPhone?: FindCustomerByPhone;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<LeadListRowDTO | null>(null);
  const now = new Date(nowIso);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/leads?${params.toString()}`);
  }

  const columns: Column<LeadListRowDTO>[] = [
    {
      header: 'Lead',
      cell: (row) => (
        <div>
          {row.customerId ? (
            <Link href={`/customers/${row.customerId}`} className="font-semibold text-foreground hover:text-brand">
              {row.name}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setSelected(row)}
              className="text-left font-semibold text-foreground hover:text-brand"
            >
              {row.name}
            </button>
          )}
          <p className="font-mono text-xs tabular-mono text-foreground-muted">{formatPhoneBR(row.phone)}</p>
        </div>
      ),
    },
    { header: 'Interesse', cell: (row) => row.interestPlan ?? 'Ainda não sei' },
    { header: 'Origem', cell: (row) => row.source },
    { header: 'Quando', align: 'right', cell: (row) => relativeWhen(new Date(row.createdAt), now, timezone) },
    { header: 'Situação', cell: (row) => <LeadStatusBadge status={row.status} /> },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <IconActionButton icon={MessageCircle} label="Abrir conversa no WhatsApp" href={whatsAppUrl(row.phone)} />
          {row.status !== 'CONVERTED' && (
            <IconActionButton
              icon={UserPlus}
              label="Converter em cliente"
              tone="brand"
              onClick={() => setSelected(row)}
            />
          )}
        </div>
      ),
    },
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
        onPageChange={(p) => setParam('page', String(p))}
        onPerPageChange={(pp) => setParam('perPage', String(pp))}
        emptyState={
          filtered ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum lead com esses filtros"
              description="Ajuste a busca ou volte para a lista completa."
              action={
                <button
                  type="button"
                  onClick={() => router.push('/leads')}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground"
                >
                  <X aria-hidden="true" size={16} />
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={Inbox}
              title="Nenhum lead ainda"
              description="Eles chegam sozinhos pelo formulário do site de captação. Use “Novo lead” para registrar quem veio por indicação ou ligação."
            />
          )
        }
      />
      <LeadDrawer
        lead={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        plans={plans}
        suppliers={suppliers}
        convertLead={convertLead}
        checkPhone={checkPhone}
      />
    </>
  );
}
