'use client';

import { Select } from '@/components/ui/select';
import type { CustomerListRowDTO } from '../queries';
import type { FichaPlanOption } from '../ficha-types';

/**
 * Célula "Plano" da tabela de Clientes: texto que vira `<select>` no clique.
 * Extraída de `customer-table.tsx` quando o arquivo passou do orçamento de
 * componente — a tabela muda por coluna nova, esta célula por regra de edição.
 */
export function CustomerPlanCell({
  row,
  plans,
  editing,
  saving,
  editable,
  onStartEdit,
  onPick,
}: {
  row: CustomerListRowDTO;
  plans: FichaPlanOption[];
  editing: boolean;
  saving: boolean;
  /** Sem a ação de troca, ou sem assinatura, a célula é só texto. */
  editable: boolean;
  onStartEdit: () => void;
  onPick: (planId: string) => void;
}) {
  if (!editable || !row.subscriptionId) return <>{row.planName ?? '—'}</>;

  if (editing) {
    return (
      <Select
        aria-label={`Trocar plano de ${row.name}`}
        value={row.planId ?? ''}
        onValueChange={onPick}
        options={plans.map((plan) => ({ value: plan.id, label: plan.name }))}
        className="h-9 w-full min-w-40"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onStartEdit}
      disabled={saving}
      className="rounded px-1 -mx-1 text-left text-sm text-foreground hover:bg-surface-elevated hover:underline disabled:opacity-60"
    >
      {saving ? 'Salvando…' : (row.planName ?? '—')}
    </button>
  );
}
