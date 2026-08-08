'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { formatLocalDate } from '@/lib/format';
import { messages } from '@/lib/messages';
import { toastError, toastSuccess } from '@/lib/toast';
import { CHANNEL_PROVIDER_LABELS } from '@/lib/labels';
import { ChannelStatusBadge } from './channel-status-badge';
import { ChannelCredentialsDialog } from './channel-credentials-dialog';
import { testChannelConnectionAction, setChannelActiveAction, setDefaultChannelAction } from '../actions';
import type { ChannelConfigDTO } from '../queries';
import type { ChannelProvider } from '@prisma/client';

export function ChannelGrid({ configs, timezone }: { configs: ChannelConfigDTO[]; timezone: string }) {
  const [editingProvider, setEditingProvider] = useState<ChannelProvider | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleTest(provider: ChannelProvider) {
    startTransition(async () => {
      const result = await testChannelConnectionAction(provider);
      if ('error' in result) {
        toastError(result.error);
        return;
      }
      if (result.ok) toastSuccess(messages.messaging.testOk);
      else toastError({ code: 'CHANNEL_TEST_FAILED', message: result.reason ?? messages.messaging.testFailed });
    });
  }

  function handleToggleActive(provider: ChannelProvider, active: boolean) {
    startTransition(async () => {
      const result = await setChannelActiveAction(provider, active);
      if ('error' in result) toastError(result.error);
      else toastSuccess(active ? messages.messaging.activated : messages.messaging.deactivated);
    });
  }

  function handleSetDefault(provider: ChannelProvider) {
    startTransition(async () => {
      const result = await setDefaultChannelAction(provider);
      if ('error' in result) toastError(result.error);
      else toastSuccess(messages.messaging.defaultSet);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {configs.map((config) => (
        <div key={config.provider} className="rounded-sm border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-bold text-foreground">{CHANNEL_PROVIDER_LABELS[config.provider]}</p>
            <ChannelStatusBadge config={config} />
          </div>
          {config.phoneNumber && <p className="text-sm text-foreground-muted">{config.phoneNumber}</p>}
          {config.lastCheckAt && (
            <p className="mt-1 text-xs text-foreground-muted">
              Último teste: {formatLocalDate(config.lastCheckAt, timezone)} — {config.lastCheckOk ? 'ok' : config.lastError}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" disabled={isPending} onClick={() => setEditingProvider(config.provider)}>
              {config.configured ? 'Editar' : 'Configurar'}
            </Button>
            {config.configured && (
              <Button type="button" variant="secondary" disabled={isPending} onClick={() => handleTest(config.provider)}>
                Testar conexão
              </Button>
            )}
            {config.configured && (
              <label className="flex items-center gap-1.5 text-sm text-foreground-muted" title={config.lastCheckOk ? undefined : 'Teste a conexão com sucesso antes de ativar.'}>
                <input
                  type="checkbox"
                  checked={config.isActive}
                  disabled={isPending || (!config.isActive && config.lastCheckOk !== true)}
                  onChange={(e) => handleToggleActive(config.provider, e.target.checked)}
                />
                Ativo
              </label>
            )}
            {config.isActive && (
              <label className="flex items-center gap-1.5 text-sm text-foreground-muted">
                <input type="radio" name="default-channel" checked={config.isDefault} disabled={isPending} onChange={() => handleSetDefault(config.provider)} />
                Padrão
              </label>
            )}
          </div>
        </div>
      ))}
      {editingProvider && (
        <ChannelCredentialsDialog open={!!editingProvider} onOpenChange={(open) => !open && setEditingProvider(null)} provider={editingProvider} />
      )}
    </div>
  );
}
