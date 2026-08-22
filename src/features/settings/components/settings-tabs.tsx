'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Store, MessageSquare } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SettingsForm } from './settings-form';
import { ChannelsTab } from './channels-tab';
import type { SettingsDTO } from '@/lib/settings';
import type { ChannelConfigDTO } from '@/features/messaging/queries';

const TAB_CLASS =
  'flex h-10 items-center gap-2 rounded-sm px-4 text-sm font-semibold';
const TAB_ACTIVE = 'bg-brand text-primary-foreground';
const TAB_INACTIVE = 'border border-border text-foreground-muted';

const TAB_SUPPORT: Record<'negocio' | 'canais', string> = {
  negocio: 'Dados que aparecem nas mensagens',
  canais: 'Quem envia e como conectar',
};

export function SettingsTabs({
  initial,
  aba,
  channelConfigs,
  timezone,
}: {
  initial: SettingsDTO;
  aba: 'negocio' | 'canais';
  channelConfigs: ChannelConfigDTO[];
  timezone: string;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDirtyChange = useCallback((next: boolean) => setDirty(next), []);

  function goToCanais() {
    if (dirty) {
      setConfirmOpen(true);
      return;
    }
    router.push('/settings?aba=canais');
  }

  function discardAndGoToCanais() {
    setConfirmOpen(false);
    setDirty(false);
    router.push('/settings?aba=canais');
  }

  return (
    <>
      <div className="mb-1 flex gap-2">
        <Link
          href="/settings?aba=negocio"
          className={`${TAB_CLASS} ${aba === 'negocio' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          <Store size={16} aria-hidden />
          Negócio
        </Link>
        <button
          type="button"
          onClick={goToCanais}
          className={`${TAB_CLASS} ${aba === 'canais' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          <MessageSquare size={16} aria-hidden />
          Canais de WhatsApp
        </button>
      </div>
      <p className="mb-4 text-xs text-foreground-muted">{TAB_SUPPORT[aba]}</p>
      {aba === 'negocio' ? (
        <SettingsForm initial={initial} onDirtyChange={handleDirtyChange} />
      ) : (
        <ChannelsTab configs={channelConfigs} timezone={timezone} />
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Descartar alterações?"
        description="Você tem alterações não salvas em Negócio. Trocar de aba vai descartá-las."
        confirmLabel="Descartar e trocar"
        onConfirm={discardAndGoToCanais}
      />
    </>
  );
}
