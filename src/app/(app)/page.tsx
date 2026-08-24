import Decimal from 'decimal.js';
import { LayoutDashboard } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { localDateOnly, localDayBoundsUtc, monthBoundsUtc } from '@/core/dates';
import { DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';
import { formatLocalDate } from '@/lib/format';
import { getSettings } from '@/lib/settings';
import { getDueDateOverview } from '@/features/charges/queries';
import { DueDateStrip } from '@/features/charges/components/due-date-strip';
import { OpenChargesTable, type PerPage } from '@/features/charges/components/open-charges-table';
import { getDashboardKpis, getMonthlySummary } from '@/features/reports/queries';
import { MonthlySummaryCard } from '@/features/reports/components/monthly-summary-card';
import { DashboardKpis } from '@/features/reports/components/dashboard-kpis';
import { listOperatorAlerts } from '@/features/dunning/queries';
import { OperatorAlerts } from '@/features/dunning/components/operator-alerts';
import { getMarginAlertSummary } from '@/features/subscriptions/queries';
import { MarginAlertBanner } from '@/features/subscriptions/components/margin-alert-banner';
import { getChannelDownAlert } from '@/features/messaging/queries';
import { ChannelDownBanner } from '@/features/messaging/components/channel-down-banner';

const PER_PAGE_VALUES = [8, 12, 20] as const;

/** `null` = sem coluna selecionada. O segundo clique na faixa cai aqui. */
function parseBucket(raw: string | undefined): DueDateBucket | null {
  return (DUE_DATE_BUCKETS as readonly string[]).includes(raw ?? '') ? (raw as DueDateBucket) : null;
}

function parsePerPage(raw: string | undefined): PerPage {
  const value = Number(raw);
  return PER_PAGE_VALUES.includes(value as PerPage) ? (value as PerPage) : 8;
}

function parsePage(raw: string | undefined): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; page?: string; perPage?: string }>;
}) {
  const params = await searchParams;
  const selectedBucket = parseBucket(params.bucket);
  const perPage = parsePerPage(params.perPage);
  const requestedPage = parsePage(params.page);

  const now = new Date();
  const settings = await getSettings();
  const { timezone } = settings;

  // Recortes de data são conceito local: vêm do fuso do negócio, nunca de UTC cru.
  const today = localDateOnly(now, timezone);
  const { from: todayStart, to: tomorrowStart } = localDayBoundsUtc(now, timezone);
  const { from, to } = monthBoundsUtc(today.getUTCFullYear(), today.getUTCMonth(), timezone);

  const [overview, summary, kpis, alerts, marginAlerts, channelDownAlert] = await Promise.all([
    getDueDateOverview(now, timezone),
    getMonthlySummary(from, to),
    getDashboardKpis(todayStart, tomorrowStart),
    listOperatorAlerts(),
    getMarginAlertSummary(new Decimal(settings.marginAlertPercent)),
    getChannelDownAlert(),
  ]);

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: timezone }).format(now);

  return (
    <AppShell title="Início" icon={<LayoutDashboard size={22} />}>
      <div className="flex flex-col gap-6">
        <MonthlySummaryCard summary={summary} monthLabel={monthLabel} />
        <DashboardKpis kpis={kpis} summary={summary} />
        <DueDateStrip
          buckets={overview.buckets}
          selected={selectedBucket}
          todayLabel={formatLocalDate(now.toISOString(), timezone)}
        />
        <ChannelDownBanner alert={channelDownAlert} timezone={timezone} />
        <MarginAlertBanner summary={marginAlerts} />
        <OpenChargesTable
          charges={overview.charges}
          selectedBucket={selectedBucket}
          requestedPage={requestedPage}
          perPage={perPage}
          timezone={timezone}
        />
        <OperatorAlerts alerts={alerts} timezone={timezone} />
      </div>
    </AppShell>
  );
}
