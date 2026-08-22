import { Alert } from '@/components/ui/alert';
import { formatLocalDate } from '@/lib/format';
import type { ChannelWarning } from '../channels/types';

/**
 * O aviso do canal vem do descritor do adapter — Meta (só template aprovado) e Evolution
 * (viola os Termos, banimento) dizem cada um o seu. Nenhum `if (provider === ...)` aqui.
 *
 * O aviso é do **canal**, não do caminho de conexão: o aceite vale para conectar por QR ou
 * por credencial colada.
 */
export function ChannelWarningNotice({
  warning,
  accepted,
  onAcceptedChange,
  acceptedAt,
  timezone,
  fieldId,
}: {
  warning: ChannelWarning;
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
  acceptedAt: string | null;
  timezone: string;
  fieldId: string;
}) {
  return (
    <Alert tone="warning" className="text-[13px] text-foreground">
      <p>{warning.text}</p>

      {warning.requiresAcceptance && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <input
              id={fieldId}
              type="checkbox"
              className="size-4"
              checked={accepted}
              onChange={(e) => onAcceptedChange(e.target.checked)}
            />
            <label htmlFor={fieldId} className="text-[13px] text-foreground-muted">
              Estou ciente do risco e quero continuar.
            </label>
          </div>
          {acceptedAt && (
            <p className="mt-1.5 text-[11px] text-foreground-muted">
              Risco aceito em <span className="font-mono tabular-nums">{formatLocalDate(acceptedAt, timezone)}</span>.
            </p>
          )}
        </>
      )}
    </Alert>
  );
}
