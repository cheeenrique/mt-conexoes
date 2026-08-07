import { useState } from 'react';
import type { UseFormSetValue } from 'react-hook-form';
import type { z } from 'zod';
import type { subscriptionSchema } from '../schema';

type FormValues = z.input<typeof subscriptionSchema>;
type PlanOption = { id: string; name: string; priceCents: string; costCents: string; cycle: string; supplierId: string | null };

// Edição: preço/custo já podem ter sido negociados com o cliente. Trocar de
// plano nunca substitui isso em silêncio — só com confirmação explícita.
// A opção sintética "(inativo)" do <select> (injetada pelo drawer pra manter
// o vínculo visível) nunca chega aqui: o caller já filtra pra `plans` reais
// antes de chamar `handlePlanChange`.
export function usePlanChangeConfirm({
  plans,
  isEditing,
  setValue,
}: {
  plans: PlanOption[];
  isEditing: boolean;
  setValue: UseFormSetValue<FormValues>;
}) {
  const [pendingPlan, setPendingPlan] = useState<PlanOption | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function applyPlanValues(plan: PlanOption) {
    setValue('priceCents', plan.priceCents);
    setValue('costCents', plan.costCents);
    setValue('cycle', plan.cycle as FormValues['cycle']);
    if (plan.supplierId) setValue('supplierId', plan.supplierId);
  }

  function handlePlanChange(planId: string) {
    setValue('planId', planId);
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    if (isEditing) {
      setPendingPlan(plan);
      setConfirmOpen(true);
      return;
    }
    applyPlanValues(plan);
  }

  function confirmPlanChange() {
    if (pendingPlan) applyPlanValues(pendingPlan);
    setPendingPlan(null);
    setConfirmOpen(false);
  }

  function cancelPlanChange() {
    setPendingPlan(null);
    setConfirmOpen(false);
  }

  return { confirmOpen, handlePlanChange, confirmPlanChange, cancelPlanChange };
}
