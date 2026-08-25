import { Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { listCustomers } from '@/features/customers/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { isCustomerSituationFilter } from '@/core/customer-situation';
import { CustomerFilters } from '@/features/customers/components/customer-filters';
import { CustomerTable } from '@/features/customers/components/customer-table';
import { CustomerFichaDrawer } from '@/features/customers/components/ficha/customer-ficha-drawer';
import { NewCustomerButton } from '@/features/customers/components/new-customer-button';
import { ImportCustomersDialog } from '@/features/customers/components/import-customers-dialog';
import { loadCustomerFichaAction, revealAccessPasswordAction } from './ficha-action';
import { findCustomerByPhoneAction, saveCustomerFichaAction } from './customer-actions';
import { importCustomersAction } from './import-action';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

function resolvePerPage(raw: string | undefined): 8 | 12 | 20 {
  const value = Number(raw);
  return PER_PAGE_OPTIONS.includes(value as (typeof PER_PAGE_OPTIONS)[number]) ? (value as 8 | 12 | 20) : 8;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string; q?: string; situacao?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = resolvePerPage(params.perPage);
  const q = params.q ?? '';
  const situacao = params.situacao ?? '';
  const situation = isCustomerSituationFilter(situacao) ? situacao : undefined;

  const settings = await getSettings();
  const [{ rows, total }, plans, suppliers] = await Promise.all([
    listCustomers({ page, perPage, q: q || undefined, situation, now: new Date(), timezone: settings.timezone }),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
  ]);

  return (
    <AppShell
      title="Clientes"
      icon={<Users size={22} />}
      primaryAction={
        <div className="flex items-center gap-2">
          <ImportCustomersDialog suppliers={suppliers} importCustomers={importCustomersAction} />
          <NewCustomerButton plans={plans} suppliers={suppliers} saveFicha={saveCustomerFichaAction} checkPhone={findCustomerByPhoneAction} />
        </div>
      }
    >
      <CustomerFilters q={q} situation={situation ?? ''} />
      <CustomerTable
        rows={rows}
        total={total}
        page={page}
        perPage={perPage}
        filtered={!!q || !!situation}
        timezone={settings.timezone}
        plans={plans}
        suppliers={suppliers}
        saveFicha={saveCustomerFichaAction}
        checkPhone={findCustomerByPhoneAction}
      />
      <CustomerFichaDrawer
        loadFicha={loadCustomerFichaAction}
        revealPassword={revealAccessPasswordAction}
        saveFicha={saveCustomerFichaAction}
        checkPhone={findCustomerByPhoneAction}
      />
    </AppShell>
  );
}
