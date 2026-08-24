'use client';

import { Controller } from 'react-hook-form';
import type { Control, FieldErrors, UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';
import { DrawerSection } from '@/components/ui/drawer';
import { Select } from '@/components/ui/select';
import { DUNNING_ACTION_OPTIONS } from '@/lib/labels';
import type { dunningStepSchema } from '../schema';

type FormValues = z.input<typeof dunningStepSchema>;

const FIELD = 'h-11 rounded-badge border border-border bg-surface-elevated px-3 text-sm text-foreground';

/**
 * Dias em número positivo + o lado do vencimento em campo próprio.
 *
 * O campo antigo era um inteiro com sinal, e digitar `5` em vez de `-5` não dá
 * erro nenhum: vira um passo válido cinco dias depois do vencimento em vez de
 * cinco antes, e a cobrança sai no dia errado para a base inteira.
 */
export function StepScheduleFields({
  register,
  control,
  errors,
  action,
}: {
  register: UseFormRegister<FormValues>;
  control: Control<FormValues>;
  errors: FieldErrors<FormValues>;
  action: FormValues['action'];
}) {
  return (
    <DrawerSection label="Quando e o quê">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
          Dias
          <input
            id="days"
            type="number"
            min={0}
            inputMode="numeric"
            {...register('days')}
            className={`${FIELD} font-mono tabular-mono`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
          Em relação ao vencimento
          <Controller
            control={control}
            name="direction"
            render={({ field }) => (
              <Select
                id="direction"
                value={field.value}
                onValueChange={field.onChange}
                className={FIELD}
                options={[
                  { value: 'before', label: 'antes do vencimento' },
                  { value: 'after', label: 'depois do vencimento' },
                ]}
              />
            )}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
          Ação
          <Controller
            control={control}
            name="action"
            render={({ field }) => (
              <Select id="action" value={field.value} onValueChange={field.onChange} className={FIELD} options={[...DUNNING_ACTION_OPTIONS]} />
            )}
          />
        </label>
      </div>

      <label className="flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
        <input type="checkbox" {...register('isActive')} className="size-4 accent-brand" />
        Passo ativo
      </label>

      {errors.days && <p className="text-[13px] text-danger">{errors.days.message}</p>}

      {action === 'SUSPEND' && (
        <p className="text-xs leading-snug text-foreground-muted">
          Suspender muda a situação da assinatura e avisa você. Não envia mensagem própria e não corta o acesso no
          fornecedor.
        </p>
      )}
    </DrawerSection>
  );
}
