import { AppShell } from '@/components/layout/app-shell';
import { getDashboardSummary } from '@/features/charges/queries';
import { getSettings } from '@/features/settings/queries';
import { DashboardPanel } from '@/features/charges/components/dashboard-panel';

export default async function DashboardPage() {
  const now = new Date();
  const settings = await getSettings();
  const summary = await getDashboardSummary(now, settings.timezone);

  return (
    <AppShell title="Painel">
      <DashboardPanel summary={summary} timezone={settings.timezone} />
    </AppShell>
  );
}
