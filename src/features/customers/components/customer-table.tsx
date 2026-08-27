'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Pencil, SearchX, Users, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatLocalDate, formatPhoneBR, whatsAppUrl } from '@/lib/format';
import { CUSTOMER_SITUATION_LABELS, CUSTOMER_SITUATION_TONES } from '@/lib/labels';
import { useCustomerParam } from '../use-customer-param';
import { NewCustomerButton } from './new-customer-button';
import type { CustomerListRowDTO } from '../queries';
import type { FichaPlanOption, FindCustomerByPhone, SaveCustomerFicha } from '../ficha-types';
import type { PerPage } from '@/components/ui/data-table-paging';

export function CustomerTable({
  rows,
  total,
  page,
  perPage,
  filtered,
  timezone,
  plans,
  suppliers,
  saveFicha,
  checkPhone,
}: {
  rows: CustomerListRowDTO[];
  total: number;
  page: number;
  perPage: PerPage;
  /** Há busca ou chip aplicado — muda o vazio de "sem dados" para "sem resultado". */
  filtered: boolean;
  timezone: string;
  /** Descem de `app/` para o "Novo cliente" do estado vazio — mesmo drawer do cabeçalho. */
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
  saveFicha: SaveCustomerFicha;
  checkPhone?: FindCustomerByPhone;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openCustomer } = useCustomerParam();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/customers?${params.toString()}`);
  }

  const columns: Column<CustomerListRowDTO>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <button
            type="button"
            onClick={() => openCustomer(row.id)}
            className="text-left text-sm font-semibold text-foreground hover:text-brand"
          >
            {row.name}
          </button>
          <p className="font-mono text-xs tabular-mono text-foreground-muted">
            {row.phone ? formatPhoneBR(row.phone) : '—'}
          </p>
        </div>
      ),
    },
    { header: 'Plano', cell: (row) => row.planName ?? '—' },
    { header: 'Fornecedor', cell: (row) => row.supplierName ?? '—' },
    {
      header: 'Vencimento',
      align: 'right',
      cell: (row) => (row.nextDueAt ? formatLocalDate(row.nextDueAt, timezone) : '—'),
    },
    {
      header: 'Situação',
      cell: (row) => (
        <StatusBadge tone={CUSTOMER_SITUATION_TONES[row.situation]}>
          {CUSTOMER_SITUATION_LABELS[row.situation]}
        </StatusBadge>
      ),
    },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.phone && (
            <IconActionButton
              icon={MessageCircle}
              label="Abrir conversa no WhatsApp"
              href={whatsAppUrl(row.phone)}
            />
          )}
          <IconActionButton icon={Pencil} label="Ver e editar cliente" onClick={() => openCustomer(row.id)} />
        </div>
      ),
    },
  ];

  return (
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
            title="Nenhum cliente com esses filtros"
            description="Ninguém na base casa com a busca e a situação escolhidas."
            action={
              <Button variant="outline" onClick={() => router.push('/customers')}>
                <X aria-hidden="true" />
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Nenhum cliente ainda"
            description="Cadastre o assinante que usa o serviço para o sistema começar a cobrar sozinho."
            action={
              <NewCustomerButton plans={plans} suppliers={suppliers} saveFicha={saveFicha} checkPhone={checkPhone} />
            }
          />
        )
      }
    />
  );
}
