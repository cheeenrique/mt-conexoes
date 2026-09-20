import Link from 'next/link';
import { Upload, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { countCustomerSituations, listCustomers } from '@/features/customers/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { CustomerFilters } from '@/features/customers/components/customer-filters';
import { CustomerTable } from '@/features/customers/components/customer-table';
import { CustomerFichaDrawer } from '@/features/customers/components/ficha/customer-ficha-drawer';
import { NewCustomerButton } from '@/features/customers/components/new-customer-button';
import { loadCustomerFichaAction, revealAccessPasswordAction } from './ficha-action';
import {
  anonymizeCustomerAction,
  findCustomerByPhoneAction,
  restoreCustomerAction,
  resumeMessagingAction,
  saveCustomerFichaAction,
  softDeleteCustomerAction,
} from './customer-actions';
import { changePlanAction } from '@/features/subscriptions/actions';
import { realignChargeAction } from '@/features/charges/actions';
import { parseCustomersSearchParams, type CustomersSearchParams } from './search-params';

export default async function CustomersPage({ searchParams }: { searchParams: Promise<CustomersSearchParams> }) {
  const { page, perPage, q, situation, planId, supplierId } = parseCustomersSearchParams(await searchParams);

  const settings = await getSettings();
  // `now` é um instante só para a lista e para os contadores: dois `new Date()`
  // podem cair em dias diferentes na virada da meia-noite, e a barra passaria a
  // prometer um número que a lista não entrega.
  const filters = {
    q: q || undefined,
    situation,
    planId: planId || undefined,
    supplierId: supplierId || undefined,
    now: new Date(),
    timezone: settings.timezone,
  };
  const [{ rows, total }, counts, plans, suppliers] = await Promise.all([
    listCustomers({ ...filters, page, perPage }),
    countCustomerSituations(filters),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
  ]);

  return (
    <AppShell
      title="Clientes"
      icon={<Users size={22} />}
      primaryAction={
        <div className="flex items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/customers/import" />}>
            <Upload aria-hidden="true" />
            Importar planilha
          </Button>
          <NewCustomerButton plans={plans} suppliers={suppliers} saveFicha={saveCustomerFichaAction} checkPhone={findCustomerByPhoneAction} />
        </div>
      }
    >
      <CustomerFilters
        q={q}
        situation={situation ?? ''}
        planId={planId}
        supplierId={supplierId}
        plans={plans}
        suppliers={suppliers}
        counts={counts}
      />
      <CustomerTable
        rows={rows}
        total={total}
        page={page}
        perPage={perPage}
        filtered={!!q || !!situation || !!planId || !!supplierId}
        timezone={settings.timezone}
        plans={plans}
        suppliers={suppliers}
        saveFicha={saveCustomerFichaAction}
        checkPhone={findCustomerByPhoneAction}
        softDeleteCustomer={softDeleteCustomerAction}
        restoreCustomer={restoreCustomerAction}
        changePlan={changePlanAction}
        realignCharge={realignChargeAction}
      />
      <CustomerFichaDrawer
        loadFicha={loadCustomerFichaAction}
        revealPassword={revealAccessPasswordAction}
        saveFicha={saveCustomerFichaAction}
        checkPhone={findCustomerByPhoneAction}
        anonymizeCustomer={anonymizeCustomerAction}
        resumeMessaging={resumeMessagingAction}
        realignCharge={realignChargeAction}
      />
    </AppShell>
  );
}
