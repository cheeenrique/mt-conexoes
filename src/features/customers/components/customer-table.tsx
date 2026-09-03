'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageCircle, Pencil, SearchX, Trash2, Users, X } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { formatLocalDate, formatPhoneBR, whatsAppUrl } from '@/lib/format';
import { CUSTOMER_SITUATION_LABELS, CUSTOMER_SITUATION_TONES } from '@/lib/labels';
import { toastError, toastSuccess } from '@/lib/toast';
import { useCustomerParam } from '../use-customer-param';
import { NewCustomerButton } from './new-customer-button';
import type { CustomerListRowDTO } from '../queries';
import type { ChangePlan, FichaPlanOption, FindCustomerByPhone, SaveCustomerFicha } from '../ficha-types';
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
  changePlan,
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
  /** Ação rápida: clicar na célula "Plano" vira select. Ausente = coluna some (só texto). */
  changePlan?: ChangePlan;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openCustomer } = useCustomerParam();
  // Um id só, não um Set: a confirmação é modal — só uma linha por vez pode
  // estar com o diálogo aberto.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const pendingRemove = rows.find((row) => row.id === pendingRemoveId) ?? null;
  // Idem para a edição rápida de plano: uma célula em modo select por vez.
  const [editingPlanRowId, setEditingPlanRowId] = useState<string | null>(null);
  const [savingPlanRowId, setSavingPlanRowId] = useState<string | null>(null);

  async function handleConfirmRemove() {
    if (!pendingRemoveId || !softDeleteCustomer) return;
    const id = pendingRemoveId;
    setPendingRemoveId(null);
    const result = await softDeleteCustomer(id);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cliente removido.');
    router.refresh();
  }

  async function handleChangePlan(row: CustomerListRowDTO, planId: string) {
    setEditingPlanRowId(null);
    if (!changePlan || !row.subscriptionId || planId === row.planId) return;
    setSavingPlanRowId(row.id);
    const result = await changePlan(row.subscriptionId, row.id, planId);
    setSavingPlanRowId(null);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Plano atualizado.');
    router.refresh();
  }

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
      cell: (row) => {
        if (!changePlan || !row.subscriptionId) return row.planName ?? '—';
        if (editingPlanRowId === row.id) {
          return (
            <Select
              aria-label={`Trocar plano de ${row.name}`}
              value={row.planId ?? ''}
              onValueChange={(next) => handleChangePlan(row, next)}
              options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
              className="h-9 w-full min-w-40"
            />
          );
        }
        return (
          <button
            type="button"
            onClick={() => setEditingPlanRowId(row.id)}
            disabled={savingPlanRowId === row.id}
            className="rounded px-1 -mx-1 text-left text-sm text-foreground hover:bg-surface-elevated hover:underline disabled:opacity-60"
          >
            {savingPlanRowId === row.id ? 'Salvando…' : (row.planName ?? '—')}
          </button>
        );
      },
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
          {/* Some para quem já saiu de vista por outro caminho (removido ou
              anonimizado) — remover de novo não tem o que fazer. */}
          {softDeleteCustomer && row.situation !== 'DELETED' && row.situation !== 'ANONYMIZED' && (
            <IconActionButton
              icon={Trash2}
              label="Remover cliente"
              tone="danger"
              onClick={() => setPendingRemoveId(row.id)}
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
      <ConfirmDialog
        open={!!pendingRemove}
        onOpenChange={(open) => !open && setPendingRemoveId(null)}
        title={pendingRemove ? `Remover "${pendingRemove.name}"?` : ''}
        description="Some da lista de clientes. O cadastro continua no banco — cobrança e histórico não mudam, mas a régua para de mensagear e cobrar enquanto estiver removido."
        confirmLabel="Remover"
        onConfirm={handleConfirmRemove}
      />
    </>
  );
}
