'use client';

import { useTransition } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLocalDate, formatPhoneBR } from '@/lib/format';
import { messages } from '@/lib/messages';
import { toastError, toastSuccess } from '@/lib/toast';
import { testChannelConnectionAction, setSendingChannelAction } from '../actions';
import type { ChannelConfigDTO } from '../queries';
import { ChannelStatusBadge } from './channel-status-badge';
import { ChannelSetupPanel } from './channel-setup-panel';

function dotClass(config: ChannelConfigDTO): string {
  if (config.isDefault) return 'bg-brand';
  if (config.configured) return 'bg-success';
  return 'bg-foreground-disabled';
}

export function ChannelRow({
  config,
  timezone,
  open,
  onToggle,
}: {
  config: ChannelConfigDTO;
  timezone: string;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleUse() {
    startTransition(async () => {
      const result = await setSendingChannelAction(config.provider);
      if ('error' in result) toastError(result.error);
      else toastSuccess(messages.messaging.defaultSet);
    });
  }

  function handleTest() {
    startTransition(async () => {
      const result = await testChannelConnectionAction(config.provider);
      if ('error' in result) toastError(result.error);
      else if (result.ok) toastSuccess(messages.messaging.testOk);
      else toastError({ code: 'CHANNEL_TEST_FAILED', message: result.reason || messages.messaging.testFailed });
    });
  }

  return (
    <div className={`rounded-sm border bg-surface ${config.isDefault ? 'border-brand' : 'border-border'}`}>
      <div className="grid gap-4 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_132px_200px_236px] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`size-2.5 shrink-0 rounded-full ${dotClass(config)}`} aria-hidden />
            <span className="truncate text-[15px] font-bold text-foreground">{config.descriptor.label}</span>
            {config.isDefault && (
              <span className="rounded-badge bg-brand/[.14] px-2 py-0.5 text-[11px] font-bold tracking-[.06em] text-brand-light">
                ENVIANDO HOJE
              </span>
            )}
          </div>
          <p className="mt-1 pl-[18px] text-[13px] text-foreground-muted">{config.descriptor.typeLabel}</p>
        </div>

        <div>
          <p className="mb-1 text-[11px] text-foreground-muted">Situação</p>
          <ChannelStatusBadge config={config} />
        </div>

        <div className="min-w-0">
          <p className="mb-1 text-[11px] text-foreground-muted">
            {config.phoneNumber ? 'Número remetente' : 'Ainda sem número'}
          </p>
          <p className="truncate font-mono text-[13px] tabular-nums text-foreground">
            {config.phoneNumber ? formatPhoneBR(config.phoneNumber) : '—'}
          </p>
          {config.lastCheckAt && (
            <p className="mt-1 font-mono text-[11px] tabular-nums text-foreground-muted">
              Último teste {formatLocalDate(config.lastCheckAt, timezone)}
              {config.lastCheckOk ? '' : ` — ${config.lastError ?? 'falhou'}`}
            </p>
          )}
          {config.configured && (
            <Button type="button" variant="ghost" size="xs" className="mt-1 -ml-2" disabled={isPending} onClick={handleTest}>
              <RefreshCw aria-hidden="true" />
              Testar de novo
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {config.configured && !config.isDefault && (
            <Button
              type="button"
              disabled={isPending || config.lastCheckOk !== true}
              title={config.lastCheckOk === true ? undefined : 'Teste a conexão com sucesso antes de usar este canal.'}
              onClick={handleUse}
            >
              <Check aria-hidden="true" />
              Usar este canal
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={isPending} onClick={() => onToggle(!open)}>
            {open ? 'Fechar' : config.configured ? 'Reconfigurar' : 'Configurar'}
          </Button>
        </div>
      </div>

      {open && <ChannelSetupPanel config={config} timezone={timezone} onClose={() => onToggle(false)} />}
    </div>
  );
}
