'use client';

import type { ChannelProvider } from '@prisma/client';
import { Alert } from '@/components/ui/alert';
import type { ChannelConnectionMethod } from '../channels/types';
import { ChannelCredentialsForm } from './channel-credentials-form';
import { ChannelPairingForm } from './channel-pairing-form';

/**
 * Uma coluna da tela de conexão. O que ela mostra sai do descritor: requisitos no callout
 * "Antes de conectar", passos numerados, campos com formato de exemplo e ajuda por campo.
 *
 * ⚠️ Nenhum `if (provider === ...)` aqui. O que decide o formulário é `method.kind`, que o
 * adapter declara — Embedded Signup da Meta, no dia em que existir, é um método a mais.
 */
export function ChannelConnectionMethodPanel({
  provider,
  channelLabel,
  method,
  accepted,
  blocked,
  connected,
  onDone,
}: {
  provider: ChannelProvider;
  channelLabel: string;
  method: ChannelConnectionMethod;
  accepted: boolean;
  blocked: boolean;
  connected: boolean;
  onDone: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-[15px] font-bold text-foreground">{method.label}</h4>
        {method.recommended && (
          <span className="rounded-badge bg-brand/[.14] px-2 py-0.5 text-[11px] font-bold tracking-[.06em] text-brand-light">
            RECOMENDADO
          </span>
        )}
      </header>

      <Alert tone="info" className="text-[13px]">
        <p className="font-bold">Antes de conectar</p>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-foreground">
          {method.requirements.map((requirement) => (
            <li key={requirement}>{requirement}</li>
          ))}
        </ul>
      </Alert>

      <ol className="flex flex-col gap-2.5">
        {method.setupSteps.map((step, index) => (
          <li key={step} className="flex items-start gap-2.5 text-[13px] text-foreground">
            <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-surface-elevated font-mono text-[11px] font-bold text-brand-light tabular-nums">
              {index + 1}
            </span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      {method.kind === 'PAIRING' ? (
        <ChannelPairingForm
          provider={provider}
          channelLabel={channelLabel}
          method={method}
          accepted={accepted}
          blocked={blocked}
          connected={connected}
        />
      ) : (
        <ChannelCredentialsForm
          provider={provider}
          method={method}
          accepted={accepted}
          blocked={blocked}
          onDone={onDone}
        />
      )}
    </section>
  );
}
