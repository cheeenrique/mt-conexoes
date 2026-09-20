'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatLocalDate, formatPhoneBR } from '@/lib/format';
import { CUSTOMER_SITUATION_TONES, customerSituationLabel } from '@/lib/labels';
import { useCustomerParam } from '../use-customer-param';
import { useCustomerRowActions } from '../use-customer-row-actions';
import { CustomerEmptyState } from './customer-empty-state';
import { CustomerPlanCell } from './customer-plan-cell';
import { CustomerRowActions } from './customer-row-actions';
import { StaleOpenChargeDialog } from './stale-open-charge-dialog';
import type { CustomerListRowDTO } from '../queries';
import type { ChangePlan, FichaPlanOption, FindCustomerByPhone, RealignCharge, SaveCustomerFicha } from '../ficha-types';
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
  softDeleteCustomer,
  restoreCustomer,
  changePlan,
  realignCharge,
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
  /** "Remover" — soft delete. Ausente = coluna de ação não ganha o botão. */
  softDeleteCustomer?: (customerId: string) => Promise<{ ok: true } | { error: { code: string; message: string } }>;
  /** Desfaz o "Remover". Só aparece na linha já removida, achada pelo chip "Removido". */
  restoreCustomer?: (customerId: string) => Promise<{ ok: true } | { error: { code: string; message: string } }>;
  /** Ação rápida: clicar na célula "Plano" vira select. Ausente = coluna some (só texto). */
  changePlan?: ChangePlan;
  /** Traz a cobrança em aberto para o valor do plano novo, depois da troca
   *  rápida. Ausente = troca sem oferecer nada, como antes. */
  realignCharge?: RealignCharge;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openCustomer } = useCustomerParam();
  const {
    pendingRemove,
    setPendingRemoveId,
    editingPlanRowId,
    setEditingPlanRowId,
    savingPlanRowId,
    staleOpenCharge,
    clearStaleOpenCharge,
    handleConfirmRemove,
    handleRestore,
    handleChangePlan,
  } = useCustomerRowActions({ rows, softDeleteCustomer, restoreCustomer, changePlan });

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
    {
      header: 'Plano',
      cell: (row) => (
        <CustomerPlanCell
          row={row}
          plans={plans}
          editing={editingPlanRowId === row.id}
          saving={savingPlanRowId === row.id}
          onStartEdit={() => setEditingPlanRowId(row.id)}
          onPick={(planId) => handleChangePlan(row, planId)}
          editable={!!changePlan}
        />
      ),
    },
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
          {customerSituationLabel(row.situation, row.daysFromDue)}
        </StatusBadge>
      ),
    },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <CustomerRowActions
          row={row}
          onOpen={openCustomer}
          onRemove={softDeleteCustomer ? setPendingRemoveId : undefined}
          onRestore={restoreCustomer ? handleRestore : undefined}
        />
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
        onPageChange={(next) => setParam('page', String(next))}
        onPerPageChange={(next) => setParam('perPage', String(next))}
        emptyState={
          <CustomerEmptyState
            filtered={filtered}
            plans={plans}
            suppliers={suppliers}
            saveFicha={saveFicha}
            checkPhone={checkPhone}
          />
        }
      />
      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
        title={pendingRemove ? `Remover "${pendingRemove.name}"?` : ''}
        description="Some da lista de clientes. O cadastro continua no banco — cobrança e histórico não mudam, mas a régua para de mensagear e cobrar enquanto estiver removido."
        confirmLabel="Remover"
        onConfirm={handleConfirmRemove}
      />
      {realignCharge && staleOpenCharge && (
        <StaleOpenChargeDialog
          stale={staleOpenCharge.charge}
          customerId={staleOpenCharge.customerId}
          realignCharge={realignCharge}
          onClose={clearStaleOpenCharge}
        />
      )}
    </>
  );
}
