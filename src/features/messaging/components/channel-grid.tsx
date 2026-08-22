'use client';

import { useState } from 'react';
import type { ChannelProvider } from '@prisma/client';
import type { ChannelConfigDTO } from '../queries';
import { ChannelRow } from './channel-row';

/**
 * Lista de canais de WhatsApp. Um canal envia por vez, e a troca é sempre do
 * operador: canal com falha aparece com a falha, o sistema não faz failover.
 */
export function ChannelGrid({ configs, timezone }: { configs: ChannelConfigDTO[]; timezone: string }) {
  const [openProvider, setOpenProvider] = useState<ChannelProvider | null>(null);
  const sending = configs.find((config) => config.isDefault);

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold tracking-[.08em] text-foreground-muted uppercase">Canais de WhatsApp</h2>
        <p className="text-[13px] text-foreground-muted">
          Um canal envia por vez.{' '}
          {sending ? (
            <>
              Hoje quem envia é <span className="font-bold text-brand-light">{sending.descriptor.label}</span>
            </>
          ) : (
            <span className="font-bold text-warning">Nenhum canal está enviando hoje</span>
          )}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {configs.map((config) => (
          <ChannelRow
            key={config.provider}
            config={config}
            timezone={timezone}
            open={openProvider === config.provider}
            onToggle={(open) => setOpenProvider(open ? config.provider : null)}
          />
        ))}
      </div>

      <p className="text-[13px] text-foreground-muted">
        Trocar de canal vale a partir do próximo despacho, que roda a cada 15 minutos dentro da janela de envio.
        A credencial nunca volta para esta tela, nem mascarada: fica só a data em que foi configurada e o botão de
        substituir. Canal com falha não troca sozinho — a falha aparece aqui e você decide.
      </p>
    </section>
  );
}
