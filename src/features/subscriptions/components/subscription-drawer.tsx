'use client';

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Decimal from 'decimal.js';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/currency-input';
import { DateInput } from '@/components/ui/date-input';
import { StatusBadge } from '@/components/ui/status-badge';
import { marginPercent } from '@/core/money';
import { CYCLE_OPTIONS } from '@/lib/labels';
import { formatLocalDate } from '@/lib/format';
import { subscriptionSchema } from '../schema';
import { createSubscriptionAction, updateSubscriptionAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { SubscriptionAccessFields } from './subscription-access-fields';
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
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  subscription: SubscriptionDTO | null;
  plans: PlanOption[];
  suppliers: { id: string; name: string }[];
  timezone: string;
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
          accessServer: subscription.accessServer ?? '',
          screens: subscription.screens,
          accessNotes: subscription.accessNotes ?? '',
        }
      : { planId: '', supplierId: '', priceCents: '0', costCents: '0', cycle: 'MONTHLY', discountType: '', discountValue: '', discountUntil: '', accessUsername: '', accessPassword: '', accessServer: '', screens: 1, accessNotes: '' },
  });

  const planOptions =
    subscription?.planId && !plans.some((p) => p.id === subscription.planId)
      ? [
          ...plans,
          {
            id: subscription.planId,
            name: `${subscription.planName ?? 'Plano'} (inativo)`,
            priceCents: '0',
            costCents: '0',
            cycle: 'MONTHLY',
            supplierId: null,
          },
        ]
      : plans;

  const supplierOptions =
    subscription?.supplierId && !suppliers.some((s) => s.id === subscription.supplierId)
      ? [...suppliers, { id: subscription.supplierId, name: `${subscription.supplierName ?? 'Fornecedor'} (inativo)` }]
      : suppliers;

  const priceCents = watch('priceCents');
  const costCents = watch('costCents');
  const liveMargin = (() => {
    try {
      return marginPercent(BigInt(priceCents || '0'), BigInt(costCents || '0'));
    } catch {
      return null;
    }
  })();

  const [pendingPlan, setPendingPlan] = useState<PlanOption | null>(null);
  const [confirmPlanChangeOpen, setConfirmPlanChangeOpen] = useState(false);

  function applyPlanValues(plan: PlanOption) {
    setValue('priceCents', plan.priceCents);
    setValue('costCents', plan.costCents);
    setValue('cycle', plan.cycle as FormValues['cycle']);
    if (plan.supplierId) setValue('supplierId', plan.supplierId);
  }

  function handlePlanChange(planId: string) {
    setValue('planId', planId);
    const plan = planOptions.find((p) => p.id === planId);
    if (!plan) return;
    if (subscription) {
      // Edição: preço/custo já podem ter sido negociados com o cliente.
      // Trocar de plano nunca substitui isso em silêncio — só com confirmação.
      setPendingPlan(plan);
      setConfirmPlanChangeOpen(true);
      return;
    }
    applyPlanValues(plan);
  }

  function confirmPlanChange() {
    if (pendingPlan) applyPlanValues(pendingPlan);
    setPendingPlan(null);
    setConfirmPlanChangeOpen(false);
  }

  function cancelPlanChange() {
    setPendingPlan(null);
    setConfirmPlanChangeOpen(false);
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
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[560px] max-h-[85vh] overflow-y-auto bg-surface">
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
              {planOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              {CYCLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="supplierId">Fornecedor</Label>
            <select id="supplierId" {...register('supplierId')} className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground">
              <option value="">Nenhum</option>
              {supplierOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
          {subscription && (
            <p className="font-mono text-sm tabular-mono text-foreground-muted">
              Próximo vencimento: {formatLocalDate(subscription.nextDueAt, timezone)}
            </p>
          )}
          <p className="text-xs text-foreground-muted">
            O novo valor vale a partir da próxima cobrança gerada. Cobranças já emitidas não mudam.
          </p>
          <SubscriptionAccessFields register={register} errors={errors} hasAccessPassword={!!subscription?.hasAccessPassword} />
          <Button type="submit" disabled={isSubmitting} className="h-11">
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmPlanChangeOpen}
      onOpenChange={(next) => { if (!next) cancelPlanChange(); }}
      title="Aplicar valores do plano?"
      description="Aplicar sugestão de preço, custo, ciclo e fornecedor do plano selecionado? Isso substitui os valores atuais do formulário."
      confirmLabel="Aplicar"
      onConfirm={confirmPlanChange}
    />
    </>
  );
}
