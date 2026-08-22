'use client';

import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DateInput } from '@/components/ui/date-input';
import { DrawerSection } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { CYCLE_OPTIONS } from '@/lib/labels';
import { marginBadgeTone } from '@/lib/margin-tone';
import { FichaField } from './ficha-field';
import type { CustomerFichaFormInput } from '../../ficha-schema';
import type { FichaPlanOption } from '../../ficha-types';

function liveMargin(priceCents: string | undefined, costCents: string | undefined) {
  try {
    return marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0'));
  } catch {
    return null;
  }
}

/** Cartão "Assinatura" do modo edição (handoff 04), com a nota fixa ao pé. */
export function FichaFormSubscription({
  register,
  control,
  errors,
  setValue,
  plans,
  suppliers,
  priceCents,
  costCents,
}: {
  register: UseFormRegister<CustomerFichaFormInput>;
  control: Control<CustomerFichaFormInput>;
  errors: FieldErrors<CustomerFichaFormInput>;
  setValue: UseFormSetValue<CustomerFichaFormInput>;
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
  priceCents: string | undefined;
  costCents: string | undefined;
}) {
  const margin = liveMargin(priceCents, costCents);

  // Escolher o plano preenche preço, custo, ciclo e o fornecedor padrão dele —
  // é o que o handoff 08 chama de "Fornecedor: o padrão" na conversão de lead.
  // Continua editável: o plano sugere, o operador decide.
  function applyPlan(planId: string) {
    setValue('planId', planId, { shouldDirty: true });
    const plan = plans.find((option) => option.id === planId);
    if (!plan) return;
    setValue('priceCents', plan.priceCents, { shouldDirty: true });
    setValue('costCents', plan.costCents, { shouldDirty: true });
    setValue('cycle', plan.cycle as CustomerFichaFormInput['cycle'], { shouldDirty: true });
    if (plan.supplierId) setValue('supplierId', plan.supplierId, { shouldDirty: true });
  }

  return (
    <DrawerSection label="Assinatura">
      <FichaField id="ficha-plan" label="Plano" error={errors.planId?.message}>
        <Select id="ficha-plan" {...register('planId')} onChange={(event) => applyPlan(event.target.value)}>
          <option value="">Nenhum</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>{plan.name}</option>
          ))}
        </Select>
      </FichaField>

      <FichaField id="ficha-supplier" label="Fornecedor" error={errors.supplierId?.message}>
        <Select id="ficha-supplier" {...register('supplierId')}>
          <option value="">Nenhum</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
          ))}
        </Select>
      </FichaField>

      <FichaField id="ficha-price" label="Valor cobrado por ciclo" error={errors.priceCents?.message}>
        <Controller
          control={control}
          name="priceCents"
          render={({ field }) => <CurrencyInput id="ficha-price" value={field.value} onValueChange={field.onChange} />}
        />
      </FichaField>

      <FichaField id="ficha-cost" label="Custo por ciclo" error={errors.costCents?.message}>
        <Controller
          control={control}
          name="costCents"
          render={({ field }) => <CurrencyInput id="ficha-cost" value={field.value} onValueChange={field.onChange} />}
        />
      </FichaField>

      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">Margem:</span>
        <StatusBadge tone={marginBadgeTone(margin)}>{margin === null ? '—' : `${margin.toFixed(1)}%`}</StatusBadge>
      </div>

      <FichaField id="ficha-cycle" label="Ciclo" error={errors.cycle?.message}>
        <Select id="ficha-cycle" {...register('cycle')}>
          {CYCLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
      </FichaField>

      <FichaField
        id="ficha-due"
        label="Próximo vencimento"
        error={errors.nextDueAt?.message}
        hint="Vazio mantém o vencimento atual."
      >
        <Controller
          control={control}
          name="nextDueAt"
          render={({ field }) => <DateInput id="ficha-due" value={field.value ?? ''} onValueChange={field.onChange} />}
        />
      </FichaField>

      <FichaField id="ficha-screens" label="Telas" error={errors.screens?.message}>
        <Input id="ficha-screens" type="number" min={1} className="h-11" {...register('screens', { valueAsNumber: true })} />
      </FichaField>

      <p className="text-xs leading-relaxed text-foreground-muted">
        O novo valor vale a partir da próxima cobrança gerada. Cobranças já emitidas não mudam.
      </p>
    </DrawerSection>
  );
}
