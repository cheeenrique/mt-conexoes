import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import type { z } from 'zod';
import type { subscriptionSchema } from '../schema';

type FormValues = z.input<typeof subscriptionSchema>;

export function SubscriptionDiscountFields({
  register,
  control,
  errors,
}: {
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
}) {
  return (
    <>
      <div>
        <Label htmlFor="discountType">Desconto</Label>
        <select id="discountType" {...register('discountType')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
          <option value="">Nenhum</option>
          <option value="PERCENT">Percentual</option>
          <option value="FIXED">Fixo</option>
        </select>
      </div>
      <div>
        <Label htmlFor="discountValue">Valor do desconto</Label>
        <Input id="discountValue" placeholder="Ex.: 10.50" aria-invalid={!!errors.discountValue} {...register('discountValue')} className="h-11" />
        {errors.discountValue && <p className="mt-1 text-sm text-danger">{errors.discountValue.message}</p>}
      </div>
      <div>
        <Label htmlFor="discountUntil">Válido até</Label>
        <Controller control={control} name="discountUntil" render={({ field }) => (
          <DateInput id="discountUntil" value={field.value ?? ''} onValueChange={field.onChange} />
        )} />
        {errors.discountUntil && <p className="mt-1 text-sm text-danger">{errors.discountUntil.message}</p>}
      </div>
    </>
  );
}
