'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, Ban, MessageCircle, Pencil, Percent, RefreshCw } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCents, whatsAppUrl } from '@/lib/format';
import { toastError, toastSuccess } from '@/lib/toast';
import { cancelChargeAction, realignChargeAction, writeOffChargeAction } from '../actions';
import { CancelChargeDialog } from './cancel-charge-dialog';
import { canCancel, canWriteOff, isStaleAmount, paymentDisabledReason } from './charge-row-policy';
import type { ChargeDTO } from '../queries';

/** Ações de linha do padrão de tabela (registrar pagamento, WhatsApp, ficha do
 *  cliente) — reusadas em Cobranças e no painel do Início. */
export function ChargeRowActions({
  charge,
  onRegisterPayment,
}: {
  charge: ChargeDTO;
  onRegisterPayment: (charge: ChargeDTO) => void;
}) {
  const router = useRouter();
  const [confirmingWriteOff, setConfirmingWriteOff] = useState(false);
  const [confirmingRealign, setConfirmingRealign] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const paymentDisabled = paymentDisabledReason(charge.status);
  const remainingCents = (BigInt(charge.netCents) - BigInt(charge.paidCents)).toString();

  async function handleRealign() {
    setConfirmingRealign(false);
    const result = await realignChargeAction(charge.id, charge.customerId);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cobrança atualizada com o valor do plano.');
    router.refresh();
  }

  async function handleCancel(reason: string) {
    setCancelling(false);
    const result = await cancelChargeAction(charge.id, charge.customerId, { reason });
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cobrança cancelada.');
    router.refresh();
  }

  async function handleWriteOff() {
    setConfirmingWriteOff(false);
    const result = await writeOffChargeAction(charge.id, charge.customerId);
    if ('error' in result) return toastError(result.error);
    toastSuccess('Cobrança fechada com o valor já pago.');
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {paymentDisabled ? (
        <IconActionButton icon={Banknote} label="Registrar pagamento" disabled disabledReason={paymentDisabled} />
      ) : (
        <IconActionButton
          icon={Banknote}
          label="Registrar pagamento"
          tone="success"
          onClick={() => onRegisterPayment(charge)}
        />
      )}
      {isStaleAmount(charge) && (
        <IconActionButton icon={RefreshCw} label="Atualizar valor pelo plano" onClick={() => setConfirmingRealign(true)} />
      )}
      {canWriteOff(charge) && (
        <IconActionButton icon={Percent} label="Dar baixa no restante" onClick={() => setConfirmingWriteOff(true)} />
      )}
      {canCancel(charge) && (
        <IconActionButton icon={Ban} label="Cancelar cobrança" tone="danger" onClick={() => setCancelling(true)} />
      )}
      {charge.customerPhone ? (
        <IconActionButton
          icon={MessageCircle}
          label="Conversar no WhatsApp"
          href={whatsAppUrl(charge.customerPhone)}
        />
      ) : (
        <IconActionButton
          icon={MessageCircle}
          label="Conversar no WhatsApp"
          disabled
          disabledReason="Cliente sem telefone cadastrado"
        />
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              href={`/customers/${charge.customerId}`}
              aria-label="Ficha do cliente"
              className="flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted transition-colors hover:text-foreground md:size-8"
            />
          }
        >
          <Pencil size={15} />
        </TooltipTrigger>
        <TooltipContent>Ficha do cliente</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirmingRealign}
        onOpenChange={setConfirmingRealign}
        title={`Atualizar a cobrança de ${charge.customerName}?`}
        description={`A cobrança passa de ${formatCents(charge.principalCents)} para ${formatCents(charge.subscriptionPriceCents)}, o valor que o plano tem hoje. Use quando o plano mudou e esta cobrança ficou com o valor antigo — não use para reajuste que vale só do próximo ciclo.`}
        confirmLabel="Atualizar valor"
        onConfirm={handleRealign}
      />
      <CancelChargeDialog
        open={cancelling}
        onOpenChange={setCancelling}
        customerName={charge.customerName}
        onConfirm={handleCancel}
      />
      <ConfirmDialog
        open={confirmingWriteOff}
        onOpenChange={setConfirmingWriteOff}
        title={`Fechar a cobrança de ${charge.customerName}?`}
        description={`Os ${formatCents(remainingCents)} que faltam viram desconto: a cobrança fecha com os ${formatCents(charge.paidCents)} que o cliente pagou, o faturado do mês cai para esse valor e o próximo ciclo abre contado do último pagamento. Não dá para desfazer.`}
        confirmLabel="Dar baixa"
        onConfirm={handleWriteOff}
      />
    </div>
  );
}
