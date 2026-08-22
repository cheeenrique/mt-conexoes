'use client';

import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import type { ConvertLeadFormInput } from '../schema';

/** Cartão "Cliente" do drawer de conversão: nome, WhatsApp e a observação pré-escrita. */
export function LeadCustomerFields({
  register,
  control,
  errors,
}: {
  register: UseFormRegister<ConvertLeadFormInput>;
  control: Control<ConvertLeadFormInput>;
  errors: FieldErrors<ConvertLeadFormInput>;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="convert-name">Nome</Label>
        <Input id="convert-name" className="h-11" aria-invalid={!!errors.name} {...register('name')} />
        {errors.name && <p className="text-sm text-danger">{errors.name.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="convert-phone">WhatsApp</Label>
        <Controller
          control={control}
          name="phone"
          render={({ field }) => <PhoneInput id="convert-phone" value={field.value} onValueChange={field.onChange} />}
        />
        {errors.phone && <p className="text-sm text-danger">{errors.phone.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="convert-notes">Observações</Label>
        <textarea
          id="convert-notes"
          {...register('notes')}
          className="min-h-20 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground"
        />
      </div>
    </>
  );
}
