import { AppShell } from '@/components/layout/app-shell';
import { getDueDateOverview } from '@/features/charges/queries';
import { getSettings } from '@/features/settings/queries';
import { DashboardPanel } from '@/features/charges/components/dashboard-panel';
import { listOperatorAlerts } from '@/features/dunning/queries';
import { OperatorAlerts } from '@/features/dunning/components/operator-alerts';
import { DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';

function parseBucket(raw: string | undefined): DueDateBucket {
  return (DUE_DATE_BUCKETS as readonly string[]).includes(raw ?? '') ? (raw as DueDateBucket) : 'D0';
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const params = await searchParams;
  const selectedBucket = parseBucket(params.bucket);

  const now = new Date();
  const settings = await getSettings();
  const [overview, alerts] = await Promise.all([
    getDueDateOverview(now, settings.timezone),
    listOperatorAlerts(),
  ]);

  return (
    <AppShell title="Painel">
      <DashboardPanel overview={overview} selectedBucket={selectedBucket} timezone={settings.timezone} />
      <OperatorAlerts alerts={alerts} timezone={settings.timezone} />
    </AppShell>
  );
}
