'use client';

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Loader2 } from 'lucide-react';
import type { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { localDateOnly, type BillingCycle } from '@/core/dates';
import { PaymentFields } from './register-payment-fields';
import { suggestNextDueAt } from './next-due-preview';
import { formatLocalDate } from '@/lib/format';
import { toastError } from '@/lib/toast';
import { registerPaymentSchema } from '../schema';
import { registerPaymentAction } from '../actions';
import type { ChargeDTO } from '../queries';

type FormValues = z.input<typeof registerPaymentSchema>;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Data local de hoje, no fuso do negócio — valor inicial e teto do campo "Data". */
function todayLocalIso(timezone: string): string {
  const local = localDateOnly(new Date(), timezone);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

/**
 * Formulário em si. A `key` do chamador garante um mount novo a cada abertura —
 * o que dá um `idempotencyKey` novo sem efeito disparando `setState`
 * (react-hooks/set-state-in-effect).
 */
function RegisterPaymentForm({ charge, timezone, onDone }: { charge: ChargeDTO; timezone: string; onDone: () => void }) {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  // O vencimento sugerido acompanha a data do pagamento **até** o operador
  // editá-lo. Depois disso a escolha é dele: recalcular por cima apagaria o
  // prazo que ele acabou de combinar com o cliente.
  const [dueTouched, setDueTouched] = useState(false);
  const todayIso = todayLocalIso(timezone);
  const remainingCents = (BigInt(charge.netCents) - BigInt(charge.paidCents)).toString();

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(registerPaymentSchema),
    defaultValues: {
      amountCents: remainingCents,
      method: 'PIX',
      paidAt: todayIso,
      nextDueAt: '',
      note: '',
      idempotencyKey,
    },
  });

  // `useWatch` e não `watch`: só ele re-renderiza o componente quando a data
  // muda, que é o que mantém o vencimento sugerido acompanhando o campo.
  const paidAt = useWatch({ control, name: 'paidAt', defaultValue: todayIso }) ?? todayIso;
  const suggestedDueAt = suggestNextDueAt({
    paidAt,
    currentDueAt: new Date(charge.dueAt),
    cycle: charge.subscriptionCycle as BillingCycle,
    timezone,
  });

  async function onSubmit(values: FormValues) {
    // Teto de hoje: comparação de ISO é lexicográfica e basta. O servidor
    // repete a checagem no fuso do negócio — aqui é só para o erro aparecer
    // no campo, não num toast.
    if (values.paidAt > todayIso) {
      setError('paidAt', { message: 'A data do pagamento não pode ser no futuro.' });
      return;
    }

    // Campo vazio = o operador não mexeu: vale a regra, recalculada aqui a
    // partir do que ele de fato submeteu, nunca de um valor preso a um render.
    const nextDueAt =
      values.nextDueAt ||
      suggestNextDueAt({
        paidAt: values.paidAt,
        currentDueAt: new Date(charge.dueAt),
        cycle: charge.subscriptionCycle as BillingCycle,
        timezone,
      }) ||
      '';

    const result = await registerPaymentAction(charge.id, charge.customerId, { ...values, nextDueAt });
    if ('error' in result) {
      toastError(result.error);
      return;
    }
    // Sem toast: a linha virando "Paga" na tabela já é a confirmação (design 05-cobrancas.md).
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Registrar pagamento</DialogTitle>
        <p className="text-sm text-foreground-muted">
          {charge.customerName} · vencimento {formatLocalDate(charge.dueAt, timezone)}
        </p>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <input type="hidden" {...register('idempotencyKey')} />
          <PaymentFields
            control={control}
            register={register}
            errors={errors}
            suggestedDueAt={suggestedDueAt}
            dueTouched={dueTouched}
            onDueTouched={() => setDueTouched(true)}
            timezone={timezone}
          />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
            {isSubmitting ? 'Registrando...' : 'Registrar pagamento'}
          </Button>
        </div>
      </form>
    </>
  );
}

export function RegisterPaymentDialog({
  charge,
  open,
  onOpenChange,
  timezone,
}: {
  charge: ChargeDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone: string;
}) {
  const session = useOpenSession(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] bg-surface">
        {charge && (
          <RegisterPaymentForm
            key={`${charge.id}:${session}`}
            charge={charge}
            timezone={timezone}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Conta as aberturas do diálogo. O conteúdo continua montado enquanto a animação
 * de saída roda (senão sobra caixa vazia sumindo), e por isso `key={charge.id}`
 * sozinha não bastava: cancelar e reabrir a **mesma** cobrança reaproveitava o
 * formulário sujo — o diálogo voltava com o valor digitado no lugar do saldo, e
 * com o mesmo `idempotencyKey`, que faria o segundo pagamento ser descartado
 * como repetido.
 */
function useOpenSession(open: boolean): number {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((current) => current + 1);
  }
  return session;
}
