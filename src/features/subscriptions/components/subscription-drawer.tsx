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
import { DateInput } from '@/components/ui/date-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { subscriptionSchema } from '../schema';
import { createSubscriptionAction, updateSubscriptionAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import type { SubscriptionDTO } from '../queries';

type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };
type FormValues = z.input<typeof subscriptionSchema>;

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

export function SubscriptionDrawer({
  open,
  onOpenChange,
  customerId,
  subscription,
  plans,
  suppliers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  subscription: SubscriptionDTO | null;
  plans: PlanOption[];
  suppliers: { id: string; name: string }[];
}) {
  const { register, control, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(subscriptionSchema),
    values: subscription
      ? {
          planId: subscription.planId ?? '',
          supplierId: subscription.supplierId ?? '',
          priceCents: subscription.priceCents,
          costCents: subscription.costCents,
          cycle: subscription.cycle,
          discountType: subscription.discountType ?? '',
          discountValue: subscription.discountValue ?? '',
          discountUntil: subscription.discountUntil?.slice(0, 10) ?? '',
          accessUsername: subscription.accessUsername ?? '',
          accessPassword: '',
          accessServer: '',
          screens: subscription.screens,
          accessNotes: subscription.accessNotes ?? '',
        }
      : { planId: '', supplierId: '', priceCents: '0', costCents: '0', cycle: 'MONTHLY', discountType: '', discountValue: '', discountUntil: '', accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '' },
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

  function handlePlanChange(planId: string) {
    setValue('planId', planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    setValue('priceCents', plan.priceCents);
    setValue('costCents', plan.costCents);
    setValue('cycle', plan.cycle as FormValues['cycle']);
    if (plan.supplierId) setValue('supplierId', plan.supplierId);
  }

  async function onSubmit(values: FormValues) {
    const result = subscription
      ? await updateSubscriptionAction(subscription.id, customerId, values)
      : await createSubscriptionAction(customerId, values);

    if ('error' in result) {
      toastError(result.error);
      return;
    }
    toastSuccess(subscription ? messages.subscriptions.updated : messages.subscriptions.created);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] bg-surface">
        <DialogHeader>
          <DialogTitle>{subscription ? 'Editar assinatura' : 'Nova assinatura'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="planId">Plano</Label>
            <select
              id="planId"
              {...register('planId')}
              onChange={(e) => handlePlanChange(e.target.value)}
              className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
            >
              <option value="">Nenhum</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <Label htmlFor="costCents">Custo</Label>
            <Controller control={control} name="costCents" render={({ field }) => (
              <CurrencyInput id="costCents" value={field.value} onValueChange={field.onChange} />
            )} />
            {errors.costCents && <p className="mt-1 text-sm text-danger">{errors.costCents.message}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Margem:</span>
            <StatusBadge tone={marginTone(liveMargin)}>{liveMargin === null ? '—' : `${liveMargin.toFixed(1)}%`}</StatusBadge>
          </div>
          <div>
            <Label htmlFor="cycle">Ciclo</Label>
            <select id="cycle" {...register('cycle')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="MONTHLY">Mensal</option>
              <option value="QUARTERLY">Trimestral</option>
              <option value="SEMIANNUAL">Semestral</option>
              <option value="ANNUAL">Anual</option>
            </select>
          </div>
          <div>
            <Label htmlFor="supplierId">Fornecedor</Label>
            <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
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
            <Input id="discountValue" placeholder="Ex.: 10.50" {...register('discountValue')} className="h-11" />
            {errors.discountValue && <p className="mt-1 text-sm text-danger">{errors.discountValue.message}</p>}
          </div>
          <div>
            <Label htmlFor="discountUntil">Válido até</Label>
            <Controller control={control} name="discountUntil" render={({ field }) => (
              <DateInput id="discountUntil" value={field.value ?? ''} onValueChange={field.onChange} />
            )} />
            {errors.discountUntil && <p className="mt-1 text-sm text-danger">{errors.discountUntil.message}</p>}
          </div>
          {subscription && (
            <p className="font-mono text-sm tabular-mono text-foreground-muted">
              Próximo vencimento: {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(subscription.nextDueAt))}
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            O novo valor vale a partir da próxima cobrança gerada. Cobranças já emitidas não mudam.
          </p>
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-foreground-muted">Acesso</p>
            <div className="flex flex-col gap-3">
              <div>
                <Label htmlFor="accessUsername">Usuário</Label>
                <Input id="accessUsername" {...register('accessUsername')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessPassword">
                  Senha {subscription?.hasAccessPassword && '(deixe em branco para manter a atual)'}
                </Label>
                <Input id="accessPassword" type="password" {...register('accessPassword')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessServer">Servidor</Label>
                <Input id="accessServer" {...register('accessServer')} className="h-11" />
              </div>
              <div>
                <Label htmlFor="screens">Telas</Label>
                <Input id="screens" type="number" min={1} {...register('screens', { valueAsNumber: true })} className="h-11" />
              </div>
              <div>
                <Label htmlFor="accessNotes">Observações de acesso</Label>
                <textarea id="accessNotes" {...register('accessNotes')} className="min-h-16 w-full rounded-sm border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground" />
              </div>
            </div>
          </div>
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
