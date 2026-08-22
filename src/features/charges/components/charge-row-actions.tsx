import Link from 'next/link';
import { Banknote, MessageCircle, Pencil } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { whatsAppUrl } from '@/lib/format';
import type { ChargeDTO } from '../queries';

const DISABLED_CLASS_NAME =
  'flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted opacity-40 cursor-not-allowed md:size-8';

function DisabledIconButton({ icon: Icon, label }: { icon: typeof Banknote; label: string }) {
  return (
    <button type="button" disabled aria-label={label} title={label} className={DISABLED_CLASS_NAME}>
      <Icon size={15} />
    </button>
  );
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
  const isLocked = charge.status === 'PAID' || charge.status === 'CANCELLED';

  return (
    <div className="flex items-center justify-end gap-1.5">
      {isLocked ? (
        <DisabledIconButton icon={Banknote} label="Cobrança já paga ou cancelada" />
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
        <DisabledIconButton icon={MessageCircle} label="Cliente sem telefone cadastrado" />
      )}
      <Link
        href={`/customers/${charge.customerId}`}
        aria-label="Ficha do cliente"
        title="Ficha do cliente"
        className="flex size-11 items-center justify-center rounded-badge border border-border text-foreground-muted transition-colors hover:text-foreground md:size-8"
      >
        <Pencil size={15} />
      </Link>
    </div>
  );
}
