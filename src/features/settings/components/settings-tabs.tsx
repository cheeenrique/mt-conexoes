'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SettingsForm } from './settings-form';
import { ChannelsTab } from './channels-tab';
import type { SettingsDTO } from '../queries';

const TAB_CLASS =
  'flex h-10 items-center rounded-sm px-4 text-sm font-semibold';
const TAB_ACTIVE = 'bg-brand text-background';
const TAB_INACTIVE = 'border border-border text-foreground-muted';

export function SettingsTabs({
  initial,
  aba,
}: {
  initial: SettingsDTO;
  aba: 'negocio' | 'canais';
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
      <div className="mb-4 flex gap-2">
        <Link
          href="/settings?aba=negocio"
          className={`${TAB_CLASS} ${aba === 'negocio' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          Negócio
        </Link>
        <button
          type="button"
          onClick={goToCanais}
          className={`${TAB_CLASS} ${aba === 'canais' ? TAB_ACTIVE : TAB_INACTIVE}`}
        >
          Canais de WhatsApp
        </button>
      </div>
      {aba === 'negocio' ? (
        <SettingsForm initial={initial} onDirtyChange={handleDirtyChange} />
      ) : (
        <ChannelsTab />
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
