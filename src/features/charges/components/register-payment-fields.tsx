'use client';

import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DateInput } from '@/components/ui/date-input';
import { Select } from '@/components/ui/select';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/labels';
import { NextDueHint } from './next-due-hint';
import type { registerPaymentSchema } from '../schema';

type FormValues = z.input<typeof registerPaymentSchema>;

/**
 * Os campos do diálogo de pagamento. Saíram do diálogo quando ele passou do
 * orçamento de componente com a entrada do "Próximo vencimento": o diálogo
 * muda por regra de submissão, os campos mudam por campo novo.
 *
 * `suggestedDueAt` é o vencimento que a regra calcula (`nextDueDate`: a data
 * mais tarde entre o vencimento em aberto e o pagamento). Ele preenche o campo
 * **até** o operador encostar nele — daí em diante a escolha é dele, e
 * recalcular por cima apagaria o prazo que ele acabou de combinar.
 */
export function PaymentFields({
  control,
  register,
  errors,
  suggestedDueAt,
  dueTouched,
  onDueTouched,
  timezone,
}: {
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  errors: FieldErrors<FormValues>;
  suggestedDueAt: string | null;
  dueTouched: boolean;
  onDueTouched: () => void;
  timezone: string;
}) {
  return (
    <>
          <div className="space-y-1.5">
            <Label htmlFor="amountCents">Valor</Label>
            <Controller
              control={control}
              name="amountCents"
              render={({ field }) => <CurrencyInput id="amountCents" value={field.value} onValueChange={field.onChange} />}
            />
            {errors.amountCents && <p className="mt-1 text-sm text-danger">{errors.amountCents.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="paidAt">Data</Label>
            <Controller
              control={control}
              name="paidAt"
              render={({ field }) => <DateInput id="paidAt" value={field.value ?? ''} onValueChange={field.onChange} />}
            />
            {errors.paidAt ? (
              <p className="mt-1 text-sm text-danger">{errors.paidAt.message}</p>
            ) : (
              <p className="text-xs text-foreground-muted">Dia em que o cliente pagou.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nextDueAt">Próximo vencimento</Label>
            <Controller
              control={control}
              name="nextDueAt"
              render={({ field }) => {
                const shown = (dueTouched ? field.value : suggestedDueAt) ?? '';
                return (
                  <>
                    <DateInput
                      id="nextDueAt"
                      value={shown}
                      onValueChange={(value) => {
                        onDueTouched();
                        field.onChange(value);
                      }}
                    />
                    {errors.nextDueAt ? (
                      <p className="mt-1 text-sm text-danger">{errors.nextDueAt.message}</p>
                    ) : (
                      <NextDueHint nextDueAt={shown} timezone={timezone} />
                    )}
                  </>
                );
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="method">Forma</Label>
            <Controller
              control={control}
              name="method"
              render={({ field }) => (
                <Select id="method" value={field.value} onValueChange={field.onChange} options={[...PAYMENT_METHOD_OPTIONS]} />
              )}
            />
          </div>
    </>
  );
}
