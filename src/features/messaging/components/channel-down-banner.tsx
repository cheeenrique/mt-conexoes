import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { formatLocalDate } from '@/lib/format';
import type { ChannelDownAlertDTO } from '../queries';

/**
 * Alerta do Início quando o canal padrão de WhatsApp está fora do ar
 * (`lastCheckOk === false`). Enquanto essa faixa aparece, `scheduled-dispatch.ts`
 * não está tentando enviar nada — as mensagens ficam `PENDING`, esperando o operador
 * reparear o canal, e é isso que o texto precisa deixar claro.
 */
export function ChannelDownBanner({ alert, timezone }: { alert: ChannelDownAlertDTO | null; timezone: string }) {
  if (!alert) return null;

  const sinceText = alert.disconnectedAt ? ` desde ${formatLocalDate(alert.disconnectedAt, timezone)}` : '';

  return (
    <Alert tone="danger" className="items-center">
      <span className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-foreground">
          Canal {alert.label} está fora do ar{sinceText} — nenhuma cobrança está sendo enviada, as mensagens ficam esperando.
        </span>
        <Link href="/settings" className="text-sm font-bold text-brand-light hover:underline">
          Ver canais
        </Link>
      </span>
    </Alert>
  );
}
