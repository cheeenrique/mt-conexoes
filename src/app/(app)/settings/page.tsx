import { Settings } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/lib/settings';
import { listChannelConfigs } from '@/features/messaging/queries';
import { ChannelGrid } from '@/features/messaging/components/channel-grid';
import { SettingsTabs } from '@/features/settings/components/settings-tabs';
import { SettingsSaveButton } from '@/features/settings/components/settings-save-button';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const aba = params.aba === 'canais' ? 'canais' : 'negocio';
  const [settings, channelConfigs] = await Promise.all([getSettings(), listChannelConfigs()]);

  // A aba Canais salva por canal ("Salvar e testar" em cada linha); o botão
  // do header dispara `<form id="settings-form">`, que só existe na aba
  // Negócio. Fora dela o clique não faria nada — melhor não mostrar o botão
  // do que mostrar um controle que mente sobre o que faz.
  return (
    <AppShell
      title="Ajustes"
      icon={<Settings size={22} />}
      primaryAction={aba === 'negocio' ? <SettingsSaveButton /> : undefined}
    >
      <SettingsTabs
        initial={settings}
        aba={aba}
        canaisContent={<ChannelGrid configs={channelConfigs} timezone={settings.timezone} />}
      />
    </AppShell>
  );
}
