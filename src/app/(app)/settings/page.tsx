import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/features/settings/queries';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { ChannelsTab } from '@/features/settings/components/channels-tab';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const aba = params.aba === 'canais' ? 'canais' : 'negocio';
  const settings = await getSettings();

  return (
    <AppShell title="Ajustes">
      <div className="mb-4 flex gap-2">
        <Link
          href="/settings?aba=negocio"
          className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === 'negocio' ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
        >
          Negócio
        </Link>
        <Link
          href="/settings?aba=canais"
          className={`flex h-10 items-center rounded-sm px-4 text-sm font-semibold ${aba === 'canais' ? 'bg-brand text-background' : 'border border-border text-foreground-muted'}`}
        >
          Canais de WhatsApp
        </Link>
      </div>
      {aba === 'negocio' ? <SettingsForm initial={settings} /> : <ChannelsTab />}
    </AppShell>
  );
}
