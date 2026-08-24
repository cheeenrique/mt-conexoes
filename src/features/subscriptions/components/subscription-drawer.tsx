'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { formatLocalDate } from '@/lib/format';
import { subscriptionSchema } from '../schema';
import { createSubscriptionAction, updateSubscriptionAction } from '../actions';
import { toastError, toastSuccess } from '@/lib/toast';
import { messages } from '@/lib/messages';
import { usePlanChangeConfirm } from '../hooks/use-plan-change-confirm';
import { SubscriptionCommercialFields } from './subscription-commercial-fields';
import { SubscriptionDiscountFields } from './subscription-discount-fields';
import { SubscriptionAccessFields } from './subscription-access-fields';
import type { SubscriptionDTO } from '../queries';

type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };
type FormValues = z.input<typeof subscriptionSchema>;

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

  // Opções sintéticas "(inativo)" mantêm o <select> mostrando o vínculo real
  // quando o plano/fornecedor da assinatura não está mais em `plans`/`suppliers`
  // (isActive: false). Existem só pra exibição — usePlanChangeConfirm recebe
  // `plans` sem elas, então selecioná-las nunca aplica sugestão de valores.
  const planOptions =
    subscription?.planId && !plans.some((p) => p.id === subscription.planId)
      ? [...plans, { id: subscription.planId, name: `${subscription.planName ?? 'Plano'} (inativo)`, priceCents: '0', costCents: '0', cycle: 'MONTHLY', supplierId: null }]
      : plans;

  const supplierOptions =
    subscription?.supplierId && !suppliers.some((s) => s.id === subscription.supplierId)
      ? [...suppliers, { id: subscription.supplierId, name: `${subscription.supplierName ?? 'Fornecedor'} (inativo)` }]
      : suppliers;

  const { confirmOpen, handlePlanChange, confirmPlanChange, cancelPlanChange } = usePlanChangeConfirm({
    plans,
    isEditing: !!subscription,
    setValue,
  });

  const priceCents = watch('priceCents');
  const costCents = watch('costCents');

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
          <SubscriptionCommercialFields
            control={control}
            errors={errors}
            planOptions={planOptions}
            supplierOptions={supplierOptions}
            onPlanChange={handlePlanChange}
            priceCents={priceCents}
            costCents={costCents}
          />
          <SubscriptionDiscountFields register={register} control={control} errors={errors} />
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
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
    <ConfirmDialog
      open={confirmOpen}
      onOpenChange={(next) => { if (!next) cancelPlanChange(); }}
      title="Aplicar valores do plano?"
      description="Aplicar sugestão de preço, custo, ciclo e fornecedor do plano selecionado? Isso substitui os valores atuais do formulário."
      confirmLabel="Aplicar"
      onConfirm={confirmPlanChange}
    />
    </>
  );
}
