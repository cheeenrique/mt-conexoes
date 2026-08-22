import { notFound } from 'next/navigation';
import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { StatusBadge } from '@/components/ui/status-badge';
import { CUSTOMER_SITUATION_LABELS, CUSTOMER_SITUATION_TONES } from '@/lib/labels';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { listSubscriptionsForCustomer } from '@/features/subscriptions/queries';
import { getSettings } from '@/lib/settings';
import { CustomerFicha } from '@/features/customers/components/ficha/customer-ficha';
import { fichaSubtitle } from '@/features/customers/components/ficha/ficha-subtitle';
import { BackButton } from '@/features/customers/components/back-button';
import { SubscriptionList } from '@/features/subscriptions/components/subscription-list';
import { loadCustomerFichaAction, revealAccessPasswordAction } from '../ficha-action';

/**
 * Deep link de um cliente: é o que permite compartilhar o link de uma pessoa.
 * Mostra a **mesma** ficha do drawer de `?cliente=<id>` — o handoff 04 pede um
 * componente só para as quatro telas — e acrescenta a lista de assinaturas,
 * que é onde se cria e se edita assinatura.
 */
export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await loadCustomerFichaAction(id);
  if ('error' in result) notFound();
  const { data } = result;

  const [plans, suppliers, subscriptions, settings] = await Promise.all([
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
    listSubscriptionsForCustomer(id),
    getSettings(),
  ]);

  return (
    <AppShell title={data.name} icon={<Users size={22} />}>
      <BackButton />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-foreground-muted">{fichaSubtitle(data)}</p>
        <StatusBadge tone={CUSTOMER_SITUATION_TONES[data.situation]}>
          {CUSTOMER_SITUATION_LABELS[data.situation]}
        </StatusBadge>
      </div>
      <CustomerFicha data={data} revealPassword={revealAccessPasswordAction} />
      <div className="mt-4">
        <SubscriptionList
          customerId={id}
          subscriptions={subscriptions}
          plans={plans}
          suppliers={suppliers}
          timezone={settings.timezone}
        />
      </div>
    </AppShell>
  );
}
