import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { marginBadgeTone } from '@/lib/margin-tone';
import { CYCLE_OPTIONS } from '@/lib/labels';
import type { z } from 'zod';
import type { subscriptionSchema } from '../schema';

type FormValues = z.input<typeof subscriptionSchema>;
type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };

export function SubscriptionCommercialFields({
  register,
  control,
  errors,
  planOptions,
  supplierOptions,
  onPlanChange,
  priceCents,
  costCents,
}: {
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  planOptions: PlanOption[];
  supplierOptions: { id: string; name: string }[];
  onPlanChange: (planId: string) => void;
  priceCents: string;
  costCents: string;
}) {
  const liveMargin = (() => {
    try {
      return marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0'));
    } catch {
      return null;
    }
  })();

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="planId">Plano</Label>
        <select
          id="planId"
          {...register('planId')}
          onChange={(e) => onPlanChange(e.target.value)}
          className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
        >
          <option value="">Nenhum</option>
          {planOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="priceCents">Preço</Label>
        <Controller control={control} name="priceCents" render={({ field }) => (
          <CurrencyInput id="priceCents" value={field.value} onValueChange={field.onChange} />
        )} />
        {errors.priceCents && <p className="mt-1 text-sm text-danger">{errors.priceCents.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="costCents">Custo</Label>
        <Controller control={control} name="costCents" render={({ field }) => (
          <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
        )} />
        {errors.costCents && <p className="mt-1 text-sm text-danger">{errors.costCents.message}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-foreground-muted">Margem:</span>
        <StatusBadge tone={marginBadgeTone(liveMargin)}>{liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}</StatusBadge>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cycle">Ciclo</Label>
        <select id="cycle" {...register('cycle')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
          {CYCLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Fornecedor</Label>
        <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
          <option value="">Nenhum</option>
          {supplierOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </>
  );
}
