'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ChannelConfigDTO } from '../queries';
import { ChannelWarningNotice } from './channel-warning-notice';
import { ChannelConnectionMethodPanel } from './channel-connection-method';

/**
 * Painel de conexão de um canal. Cada caminho declarado pelo descritor vira uma coluna —
 * o recomendado primeiro, com selo. Canal com um caminho só ocupa a largura inteira.
 *
 * O aviso de risco fica **acima** das colunas: o risco é do canal, não do caminho, e o
 * aceite vale para os dois.
 */
export function ChannelSetupPanel({
  config,
  timezone,
  onClose,
}: {
  config: ChannelConfigDTO;
  timezone: string;
  onClose: () => void;
}) {
  const { descriptor, provider } = config;
  const [accepted, setAccepted] = useState(false);
  const blocked = descriptor.warning.requiresAcceptance && !accepted;
  const methods = descriptor.connectionMethods;

  return (
    <div className="flex flex-col gap-5 border-t border-border p-4">
      <ChannelWarningNotice
        warning={descriptor.warning}
        accepted={accepted}
        onAcceptedChange={setAccepted}
        acceptedAt={config.riskAcceptedAt}
        timezone={timezone}
        fieldId={`${provider}-risk`}
      />

      <div
        className={
          methods.length > 1
            ? 'grid gap-6 md:grid-cols-2 md:divide-x md:divide-border [&>section:first-child]:md:pr-6 [&>section:last-child]:md:pl-6'
            : 'max-w-xl'
        }
      >
        {methods.map((method) => (
          <ChannelConnectionMethodPanel
            key={method.id}
            provider={provider}
            channelLabel={descriptor.label}
            method={method}
            accepted={accepted}
            blocked={blocked}
            connected={config.lastCheckOk === true}
            onDone={onClose}
          />
        ))}
      </div>

      <div>
        <Button type="button" variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
