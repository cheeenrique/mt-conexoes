import { AppShell } from '@/components/layout/app-shell';
import { getDashboardSummary } from '@/features/charges/queries';
import { getSettings } from '@/features/settings/queries';
import { DashboardPanel } from '@/features/charges/components/dashboard-panel';
import { listOperatorAlerts } from '@/features/dunning/queries';
import { OperatorAlerts } from '@/features/dunning/components/operator-alerts';

export default async function DashboardPage() {
  const now = new Date();
  const settings = await getSettings();
  const [summary, alerts] = await Promise.all([
    getDashboardSummary(now, settings.timezone),
    listOperatorAlerts(),
  ]);

  return (
    <AppShell title="Painel">
      <OperatorAlerts alerts={alerts} timezone={settings.timezone} />
      <DashboardPanel summary={summary} timezone={settings.timezone} />
    </AppShell>
  );
}
