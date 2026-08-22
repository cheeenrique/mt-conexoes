'use client';

import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { CYCLE_LABELS } from '@/lib/labels';
import type { ConvertLeadFormInput } from '../schema';
import type { ConvertPlanOption, ConvertSupplierOption } from './convert-options';

/**
 * Cartão "Assinatura" do drawer de conversão. Plano e fornecedor chegam
 * pré-selecionados (handoff 08); valor e custo ficam **visíveis** porque
 * converter emite a primeira cobrança no mesmo commit — o operador precisa ver
 * quanto vai ser cobrado antes de salvar, não depois na lista de cobranças.
 */
export function LeadConvertFields({
  register,
  control,
  errors,
  setValue,
  plans,
  suppliers,
}: {
  register: UseFormRegister<ConvertLeadFormInput>;
  control: Control<ConvertLeadFormInput>;
  errors: FieldErrors<ConvertLeadFormInput>;
  setValue: UseFormSetValue<ConvertLeadFormInput>;
  plans: ConvertPlanOption[];
  suppliers: ConvertSupplierOption[];
}) {
  function applyPlan(planId: string) {
    setValue('planId', planId);
    const plan = plans.find((option) => option.id === planId);
    if (!plan) return;
    setValue('supplierId', plan.supplierId ?? '');
    setValue('priceCents', plan.priceCents);
    setValue('costCents', plan.costCents);
    setValue('cycle', plan.cycle);
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="convert-plan">Plano</Label>
        <Select id="convert-plan" {...register('planId')} onChange={(event) => applyPlan(event.target.value)}>
          <option value="">Nenhum</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} · {CYCLE_LABELS[plan.cycle] ?? plan.cycle}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="convert-supplier">Fornecedor</Label>
        <Select id="convert-supplier" {...register('supplierId')}>
          <option value="">Nenhum</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="convert-price">Valor cobrado por ciclo</Label>
          <Controller
            control={control}
            name="priceCents"
            render={({ field }) => (
              <CurrencyInput id="convert-price" value={field.value ?? '0'} onValueChange={field.onChange} />
            )}
          />
          {errors.priceCents && <p className="text-sm text-danger">{errors.priceCents.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="convert-cost">Custo por ciclo</Label>
          <Controller
            control={control}
            name="costCents"
            render={({ field }) => (
              <CurrencyInput id="convert-cost" value={field.value ?? '0'} onValueChange={field.onChange} />
            )}
          />
          {errors.costCents && <p className="text-sm text-danger">{errors.costCents.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="convert-screens">Telas</Label>
        <Input
          id="convert-screens"
          type="number"
          min={1}
          className="h-11"
          aria-invalid={!!errors.screens}
          {...register('screens', { valueAsNumber: true })}
        />
        {errors.screens && <p className="text-sm text-danger">{errors.screens.message}</p>}
      </div>

      <p className="text-xs leading-relaxed text-foreground-muted">
        Ao converter, a primeira cobrança já é emitida com esse valor, vencendo um ciclo à frente de hoje.
      </p>
    </>
  );
}
