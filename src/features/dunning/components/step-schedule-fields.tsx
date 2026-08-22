'use client';

import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import type { z } from 'zod';
import { DrawerSection } from '@/components/ui/drawer';
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
  errors,
  action,
}: {
  register: UseFormRegister<FormValues>;
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
          <select id="direction" {...register('direction')} className={FIELD}>
            <option value="before">antes do vencimento</option>
            <option value="after">depois do vencimento</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-foreground">
          Ação
          <select id="action" {...register('action')} className={FIELD}>
            {DUNNING_ACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
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
