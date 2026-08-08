import { notFound } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { getCustomer } from '@/features/customers/queries';
import { listSubscriptionsForCustomer } from '@/features/subscriptions/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/features/settings/queries';
import { getChargesForCustomer } from '@/features/charges/queries';
import { listMessagesForCustomer } from '@/features/messaging/queries';
import { CustomerProfileHeader } from '@/features/customers/components/customer-profile-header';
import { CustomerTabs } from '@/features/customers/components/customer-tabs';
import { BackButton } from '@/features/customers/components/back-button';
import { SubscriptionList } from '@/features/subscriptions/components/subscription-list';
import { CustomerChargeHistory } from '@/features/charges/components/customer-charge-history';
import { MessageTimeline } from '@/features/messaging/components/message-timeline';

function resolveAba(raw: string | undefined): 'subscriptions' | 'charges' | 'messages' {
  if (raw === 'charges' || raw === 'messages') return raw;
  return 'subscriptions';
}

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  const aba = resolveAba((await searchParams).aba);

  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [subscriptions, plans, suppliers, settings, charges, messages] = await Promise.all([
    listSubscriptionsForCustomer(id),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
    getSettings(),
    getChargesForCustomer(id),
    listMessagesForCustomer(id),
  ]);

  const activeSub = subscriptions.find((s) => s.status === 'ACTIVE');
  const since =
    subscriptions.length > 0
      ? new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: settings.timezone }).format(
          new Date(subscriptions[subscriptions.length - 1].startedAt),
        )
      : '—';

  return (
    <AppShell title={customer.name}>
      <BackButton />
      <CustomerProfileHeader
        name={customer.name}
        supplierName={activeSub?.supplierName ?? null}
        since={since}
        active={!!activeSub}
      />
      <div className="mt-6">
        <CustomerTabs customerId={id} aba={aba}>
          {aba === 'charges' ? (
            <CustomerChargeHistory charges={charges} timezone={settings.timezone} />
          ) : aba === 'messages' ? (
            <MessageTimeline messages={messages} timezone={settings.timezone} />
          ) : (
            <SubscriptionList
              customerId={id}
              subscriptions={subscriptions}
              plans={plans}
              suppliers={suppliers}
              timezone={settings.timezone}
            />
          )}
        </CustomerTabs>
      </div>
    </AppShell>
  );
}
