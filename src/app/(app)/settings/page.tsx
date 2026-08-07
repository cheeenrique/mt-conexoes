import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/features/settings/queries';
import { SettingsTabs } from '@/features/settings/components/settings-tabs';

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
      <SettingsTabs initial={settings} aba={aba} />
    </AppShell>
  );
}
