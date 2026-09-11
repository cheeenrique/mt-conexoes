'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Banknote, MessageCircle, Pencil, Percent } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCents, whatsAppUrl } from '@/lib/format';
import { toastError, toastSuccess } from '@/lib/toast';
import { writeOffChargeAction } from '../actions';
import type { ChargeDTO } from '../queries';

/** Por que o botão de registrar pagamento está travado — nunca junta os dois
 *  casos numa frase só ("já paga ou cancelada"): o operador quer saber qual. */
function paymentDisabledReason(status: ChargeDTO['status']): string | undefined {
  if (status === 'PAID') return 'Cobrança já paga';
  if (status === 'CANCELLED') return 'Cobrança cancelada';
  return undefined;
}

/** A baixa só existe onde há saldo pago e saldo devendo — o cliente que pagou
 *  parte e não vai pagar o resto. Fora disso o botão nem aparece: cobrança sem
 *  pagamento se cancela, e cobrança quitada não tem restante. */
function canWriteOff(charge: ChargeDTO): boolean {
  return charge.status !== 'PAID' && charge.status !== 'CANCELLED' && BigInt(charge.paidCents) > 0n;
}

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
  const paymentDisabled = paymentDisabledReason(charge.status);
  const remainingCents = (BigInt(charge.netCents) - BigInt(charge.paidCents)).toString();

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
      {canWriteOff(charge) && (
        <IconActionButton icon={Percent} label="Dar baixa no restante" onClick={() => setConfirmingWriteOff(true)} />
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
