import { AppShell } from '@/components/layout/app-shell';
import { listMessages } from '@/features/messaging/queries';
import { getSettings } from '@/lib/settings';
import { getDefaultRuleWithSteps } from '@/features/dunning/queries';
import { MessageLog } from '@/features/messaging/components/message-log';
import { parsePeriod, parseStatus, resolvePeriodBounds } from '@/features/messaging/message-log-format';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; status?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const status = parseStatus(params.status);

  const settings = await getSettings();
  const { from, to } = resolvePeriodBounds(period, new Date(), settings.timezone);

  const [{ entries, truncated }, rule] = await Promise.all([
    listMessages({ from, to }),
    getDefaultRuleWithSteps(),
  ]);

  return (
    <AppShell title="Mensagens">
      <MessageLog
        entries={entries}
        truncated={truncated}
        period={period}
        status={status}
        ruleStatus={rule.status}
        timezone={settings.timezone}
      />
    </AppShell>
  );
}
