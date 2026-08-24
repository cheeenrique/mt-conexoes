import { Controller } from 'react-hook-form';
import type { Control, FieldErrors } from 'react-hook-form';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { marginBadgeTone } from '@/lib/margin-tone';
import { CYCLE_OPTIONS } from '@/lib/labels';
import type { z } from 'zod';
import type { subscriptionSchema } from '../schema';

type FormValues = z.input<typeof subscriptionSchema>;
type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };

export function SubscriptionCommercialFields({
  control,
  errors,
  planOptions,
  supplierOptions,
  onPlanChange,
  priceCents,
  costCents,
}: {
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
        <Controller
          control={control}
          name="planId"
          render={({ field }) => (
            <Select
              id="planId"
              value={field.value ?? ''}
              onValueChange={onPlanChange}
              options={[{ value: '', label: 'Nenhum' }, ...planOptions.map((p) => ({ value: p.id, label: p.name }))]}
            />
          )}
        />
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
        <Controller
          control={control}
          name="cycle"
          render={({ field }) => <Select id="cycle" value={field.value} onValueChange={field.onChange} options={[...CYCLE_OPTIONS]} />}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="supplierId">Fornecedor</Label>
        <Controller
          control={control}
          name="supplierId"
          render={({ field }) => (
            <Select
              id="supplierId"
              value={field.value ?? ''}
              onValueChange={field.onChange}
              options={[{ value: '', label: 'Nenhum' }, ...supplierOptions.map((s) => ({ value: s.id, label: s.name }))]}
            />
          )}
        />
      </div>
    </>
  );
}
