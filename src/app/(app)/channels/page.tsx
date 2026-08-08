import { AppShell } from '@/components/layout/app-shell';
import { listChannelConfigs } from '@/features/messaging/queries';
import { getSettings } from '@/features/settings/queries';
import { ChannelGrid } from '@/features/messaging/components/channel-grid';

export default async function ChannelsPage() {
  const [configs, settings] = await Promise.all([listChannelConfigs(), getSettings()]);

  return (
    <AppShell title="Canais">
      <ChannelGrid configs={configs} timezone={settings.timezone} />
    </AppShell>
  );
}
