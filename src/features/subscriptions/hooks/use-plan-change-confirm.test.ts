import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { usePlanChangeConfirm } from './use-plan-change-confirm';
import type { subscriptionSchema } from '../schema';

type FormValues = z.input<typeof subscriptionSchema>;

const REAL_PLAN = { id: 'plan-real', name: 'Plano real', priceCents: '5000', costCents: '2000', cycle: 'MONTHLY', supplierId: null };

function useHarness() {
  const { setValue, watch } = useForm<FormValues>({
    defaultValues: { planId: '', priceCents: '9900', costCents: '4000', cycle: 'ANNUAL', supplierId: '' },
  });
  const confirm = usePlanChangeConfirm({ plans: [REAL_PLAN], isEditing: true, setValue });
  return { ...confirm, watch };
}

describe('usePlanChangeConfirm — regressão do bug de zeramento (item 1 x confirmação de plano)', () => {
  it('selecionar a opção sintética "(inativo)" (fora de `plans`) não abre confirmação nem toca preço/custo', () => {
    const { result } = renderHook(() => useHarness());

    act(() => result.current.handlePlanChange('plan-inactive-not-in-list'));

    expect(result.current.confirmOpen).toBe(false);
    expect(result.current.watch('priceCents')).toBe('9900');
    expect(result.current.watch('costCents')).toBe('4000');
  });

  it('plano real -> cancelar -> opção inativa -> confirmar: preço/custo nunca zeram', () => {
    const { result } = renderHook(() => useHarness());

    act(() => result.current.handlePlanChange('plan-real'));
    expect(result.current.confirmOpen).toBe(true);

    act(() => result.current.cancelPlanChange());
    expect(result.current.confirmOpen).toBe(false);
    expect(result.current.watch('priceCents')).toBe('9900');

    act(() => result.current.handlePlanChange('plan-inactive-not-in-list'));
    expect(result.current.confirmOpen).toBe(false);

    act(() => result.current.confirmPlanChange());
    expect(result.current.watch('priceCents')).toBe('9900');
    expect(result.current.watch('costCents')).toBe('4000');
  });

  it('confirmar troca pra um plano real de verdade aplica preço/custo/ciclo do plano', () => {
    const { result } = renderHook(() => useHarness());

    act(() => result.current.handlePlanChange('plan-real'));
    act(() => result.current.confirmPlanChange());

    expect(result.current.watch('priceCents')).toBe('5000');
    expect(result.current.watch('costCents')).toBe('2000');
  });
});
