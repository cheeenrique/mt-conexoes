import Link from 'next/link';
import { Upload, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { listCustomers } from '@/features/customers/queries';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { isCustomerSituationFilter } from '@/core/customer-situation';
import { CustomerFilters } from '@/features/customers/components/customer-filters';
import { CustomerTable } from '@/features/customers/components/customer-table';
import { CustomerFichaDrawer } from '@/features/customers/components/ficha/customer-ficha-drawer';
import { NewCustomerButton } from '@/features/customers/components/new-customer-button';
import { loadCustomerFichaAction, revealAccessPasswordAction } from './ficha-action';
import { findCustomerByPhoneAction, saveCustomerFichaAction } from './customer-actions';
import { resolvePerPage } from '@/components/ui/data-table-paging';

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
          <Button variant="outline" nativeButton={false} render={<Link href="/customers/import" />}>
            <Upload aria-hidden="true" />
            Importar planilha
          </Button>
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
