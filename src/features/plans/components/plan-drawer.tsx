'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Drawer, DrawerContent, DrawerHeader, DrawerBody, DrawerSection, DrawerFooter } from '@/components/ui/drawer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { marginBadgeTone } from '@/lib/margin-tone';
import { planSchema } from '../schema';
import { CYCLE_OPTIONS } from '@/lib/labels';
import { createPlanAction, updatePlanAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { PlanDTO } from '../queries';

type FormValues = z.input<typeof planSchema>;

/** Digitação intermediária pode não ser um inteiro válido ainda (ex.: campo vazio) — sem margem nesse instante. */
function computeLiveMargin(priceCents: string, costCents: string): Decimal | null {
  try {
    return marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0'));
  } catch {
    return null;
  }
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

  const priceCents = watch('priceCents');
  const costCents = watch('costCents');
  const liveMargin = computeLiveMargin(priceCents, costCents);

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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent size="default" aria-label={plan ? 'Editar plano' : 'Novo plano'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-1 flex-col">
          <DrawerHeader title={plan ? 'Editar plano' : 'Novo plano'} />
          <DrawerBody>
            <DrawerSection label="Dados do plano">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" aria-invalid={!!errors.name} {...register('name')} className="h-11" />
                {errors.name && <p className="mt-1 text-sm text-danger">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
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
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </DrawerSection>
            <DrawerSection label="Preço e custo sugeridos">
              <div className="space-y-1.5">
                <Label htmlFor="priceCents">Preço sugerido</Label>
                <Controller control={control} name="priceCents" render={({ field }) => (
                  <CurrencyInput id="priceCents" value={field.value} onValueChange={field.onChange} />
                )} />
                {errors.priceCents && <p className="mt-1 text-sm text-danger">{errors.priceCents.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="costCents">Custo sugerido</Label>
                <Controller control={control} name="costCents" render={({ field }) => (
                  <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
                )} />
                {errors.costCents && <p className="mt-1 text-sm text-danger">{errors.costCents.message}</p>}
              </div>
              <p className="text-xs text-foreground-muted">
                Estes valores só preenchem o formulário de uma assinatura nova. O que o cliente paga de verdade é o
                valor negociado na assinatura dele.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground-muted">Margem sugerida:</span>
                <StatusBadge tone={marginBadgeTone(liveMargin)}>
                  {liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}
                </StatusBadge>
              </div>
            </DrawerSection>
            {plan && (
              <DrawerSection label="Status">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isActive" {...register('isActive')} className="h-4 w-4" />
                  <Label htmlFor="isActive">Ativo</Label>
                </div>
                <Alert tone="warning" className="text-xs text-foreground-muted">
                  <p>Editar este plano não muda nenhuma assinatura existente nem cobrança já emitida.</p>
                  <p className="mt-1.5">Reajuste é ação na assinatura, ou em lote a partir do fornecedor.</p>
                </Alert>
              </DrawerSection>
            )}
          </DrawerBody>
          <DrawerFooter>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
