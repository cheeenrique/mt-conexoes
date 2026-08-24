import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateInput } from '@/components/ui/date-input';
import { Select } from '@/components/ui/select';
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
      <div className="space-y-1.5">
        <Label htmlFor="discountType">Desconto</Label>
        <Controller
          control={control}
          name="discountType"
          render={({ field }) => (
            <Select
              id="discountType"
              value={(field.value as string | undefined) ?? ''}
              onValueChange={field.onChange}
              options={[
                { value: '', label: 'Nenhum' },
                { value: 'PERCENT', label: 'Percentual' },
                { value: 'FIXED', label: 'Fixo' },
              ]}
            />
          )}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="discountValue">Valor do desconto</Label>
        <Input id="discountValue" placeholder="Ex.: 10.50" aria-invalid={!!errors.discountValue} {...register('discountValue')} className="h-11" />
        {errors.discountValue && <p className="mt-1 text-sm text-danger">{errors.discountValue.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="discountUntil">Válido até</Label>
        <Controller control={control} name="discountUntil" render={({ field }) => (
          <DateInput id="discountUntil" value={field.value ?? ''} onValueChange={field.onChange} />
        )} />
        {errors.discountUntil && <p className="mt-1 text-sm text-danger">{errors.discountUntil.message}</p>}
      </div>
    </>
  );
}
