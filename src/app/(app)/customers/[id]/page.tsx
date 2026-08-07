import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { getCustomer } from '@/features/customers/queries';
import { listSubscriptionsForCustomer } from '@/features/subscriptions/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { CustomerProfileHeader } from '@/features/customers/components/customer-profile-header';
import { CustomerTabs } from '@/features/customers/components/customer-tabs';
import { SubscriptionList } from '@/features/subscriptions/components/subscription-list';

export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string }>;
}) {
  const { id } = await params;
  await searchParams; // única aba real hoje é "subscriptions" — ?aba= é lido aqui pra manter o
  // padrão de URL-as-state estabelecido em 1a; passa a ramificar quando Cobranças/Mensagens
  // ganharem conteúdo real (Etapa 2/3), não antes.
  const aba = 'subscriptions';

  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [subscriptions, plans, suppliers] = await Promise.all([
    listSubscriptionsForCustomer(id),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
  ]);

  const activeSub = subscriptions.find((s) => s.status === 'ACTIVE');
  const since = new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(
    subscriptions.length > 0 ? new Date(subscriptions[subscriptions.length - 1].startedAt) : new Date(),
  );

  return (
    <AppShell title={customer.name}>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft size={15} /> Voltar
      </Link>
      <CustomerProfileHeader
        name={customer.name}
        supplierName={activeSub?.supplierName ?? null}
        since={since}
        active={!!activeSub}
      />
      <div className="mt-6">
        <CustomerTabs customerId={id} aba={aba}>
          <SubscriptionList customerId={id} subscriptions={subscriptions} plans={plans} suppliers={suppliers} />
        </CustomerTabs>
      </div>
    </AppShell>
  );
}
