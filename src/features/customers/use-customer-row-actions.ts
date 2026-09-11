'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toastError, toastSuccess } from '@/lib/toast';
import type { CustomerListRowDTO } from './queries';
import type { ChangePlan } from './ficha-types';

type ActionResult = { ok: true } | { error: { code: string; message: string } };
type CustomerAction = (customerId: string) => Promise<ActionResult>;

/**
 * As mutações da linha de Clientes — remover, restaurar e trocar o plano — com
 * o estado que cada uma precisa. Saiu de `customer-table.tsx` quando o arquivo
 * passou do orçamento de componente: a tabela muda por coluna nova, isto muda
 * por ação nova.
 *
 * Um id por vez em cada estado, não um `Set`: a confirmação de remoção é modal
 * e a edição de plano é uma célula em modo `<select>` — as duas são, por
 * desenho, uma linha só.
 */
export function useCustomerRowActions(params: {
  rows: CustomerListRowDTO[];
  softDeleteCustomer?: CustomerAction;
  restoreCustomer?: CustomerAction;
  changePlan?: ChangePlan;
}) {
  const router = useRouter();
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const [editingPlanRowId, setEditingPlanRowId] = useState<string | null>(null);
  const [savingPlanRowId, setSavingPlanRowId] = useState<string | null>(null);

  const pendingRemove = params.rows.find((row) => row.id === pendingRemoveId) ?? null;

  async function run(action: Promise<ActionResult>, okMessage: string) {
    const result = await action;
    if ('error' in result) return toastError(result.error);
    toastSuccess(okMessage);
    router.refresh();
  }

  async function handleConfirmRemove() {
    if (!pendingRemoveId || !params.softDeleteCustomer) return;
    const id = pendingRemoveId;
    setPendingRemoveId(null);
    await run(params.softDeleteCustomer(id), 'Cliente removido.');
  }

  async function handleRestore(customerId: string) {
    if (!params.restoreCustomer) return;
    await run(params.restoreCustomer(customerId), 'Cliente restaurado.');
  }

  async function handleChangePlan(row: CustomerListRowDTO, planId: string) {
    setEditingPlanRowId(null);
    if (!params.changePlan || !row.subscriptionId || planId === row.planId) return;
    setSavingPlanRowId(row.id);
    const result = await params.changePlan(row.subscriptionId, row.id, planId);
    setSavingPlanRowId(null);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Plano atualizado.');
    router.refresh();
  }

  return {
    pendingRemove,
    setPendingRemoveId,
    editingPlanRowId,
    setEditingPlanRowId,
    savingPlanRowId,
    handleConfirmRemove,
    handleRestore,
    handleChangePlan,
  };
}
