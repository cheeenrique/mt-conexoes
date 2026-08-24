import { Truck } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { listSuppliers } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { SupplierTable } from '@/features/suppliers/components/supplier-table';
import { NewSupplierButton } from '@/features/suppliers/components/new-supplier-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;

  const [{ rows, total }, settings] = await Promise.all([
    listSuppliers({ page, perPage }),
    getSettings(),
  ]);

  return (
    <AppShell title="Fornecedores" icon={<Truck size={22} />} primaryAction={<NewSupplierButton marginAlertPercent={settings.marginAlertPercent} />}>
      <SupplierTable
        rows={rows}
        total={total}
        page={page}
        perPage={perPage}
        marginAlertPercent={settings.marginAlertPercent}
      />
    </AppShell>
  );
}
