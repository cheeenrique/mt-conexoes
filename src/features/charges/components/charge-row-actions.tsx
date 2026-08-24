import Link from 'next/link';
import { Banknote, MessageCircle, Pencil } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { whatsAppUrl } from '@/lib/format';
import type { ChargeDTO } from '../queries';

/** Por que o botão de registrar pagamento está travado — nunca junta os dois
 *  casos numa frase só ("já paga ou cancelada"): o operador quer saber qual. */
function paymentDisabledReason(status: ChargeDTO['status']): string | undefined {
  if (status === 'PAID') return 'Cobrança já paga';
  if (status === 'CANCELLED') return 'Cobrança cancelada';
  return undefined;
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
  const paymentDisabled = paymentDisabledReason(charge.status);

  return (
    <div className="flex items-center justify-end gap-1.5">
      {paymentDisabled ? (
        <IconActionButton icon={Banknote} label="Registrar pagamento" disabled disabledReason={paymentDisabled} />
      ) : (
        <IconActionButton icon={Banknote} label="Registrar pagamento" onClick={() => onRegisterPayment(charge)} />
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
    </div>
  );
}
