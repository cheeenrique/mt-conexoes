'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { planSchema, CYCLE_OPTIONS } from '../schema';
import { createPlanAction, updatePlanAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { PlanDTO } from '../queries';

type FormValues = z.input<typeof planSchema>;

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

export function PlanDrawer({
  open,
  onOpenChange,
  plan,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PlanDTO | null;
  suppliers: { id: string; name: string }[];
}) {
  const { register, control, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(planSchema),
    values: plan
      ? { name: plan.name, priceCents: plan.priceCents, costCents: plan.costCents, cycle: plan.cycle, supplierId: plan.supplierId ?? '', isActive: plan.isActive }
      : { name: '', priceCents: '0', costCents: '0', cycle: 'MONTHLY', supplierId: '', isActive: true },
  });

  const [liveMargin, setLiveMargin] = useState<Decimal | null>(null);
  const priceCents = watch('priceCents');
  const costCents = watch('costCents');

  useEffect(() => {
    try {
      setLiveMargin(marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0')));
    } catch {
      setLiveMargin(null);
    }
  }, [priceCents, costCents]);

  async function onSubmit(values: FormValues) {
    const result = plan ? await updatePlanAction(plan.id, values) : await createPlanAction(values);
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(plan ? messages.plans.updated : messages.plans.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[520px] bg-surface">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar plano' : 'Novo plano'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
            {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
          </div>
          <div>
            <Label htmlFor="cycle">Ciclo</Label>
            <select id="cycle" {...register('cycle')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              {CYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priceCents">Preço</Label>
            <Controller control={control} name="priceCents" render={({ field }) => (
              <CurrencyInput id="priceCents" value={field.value} onValueChange={field.onChange} />
            )} />
            {errors.priceCents && <p className="mt-1 text-sm text-danger">{errors.priceCents.message}</p>}
          </div>
          <div>
            <Label htmlFor="costCents">Custo padrão</Label>
            <Controller control={control} name="costCents" render={({ field }) => (
              <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
            )} />
            {errors.costCents && <p className="mt-1 text-sm text-danger">{errors.costCents.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Margem:</span>
            <StatusBadge tone={marginTone(liveMargin)}>
              {liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}
            </StatusBadge>
          </div>
          <div>
            <Label htmlFor="supplierId">Fornecedor padrão</Label>
            <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {plan && (
            <>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="isActive" {...register('isActive')} className="h-4 w-4" />
                <Label htmlFor="isActive">Ativo</Label>
              </div>
              <p className="text-xs text-foreground-muted">Mudar o preço não reajusta assinatura existente.</p>
            </>
          )}
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
