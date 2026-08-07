import { AppShell } from '@/components/layout/app-shell';
import { listSuppliers } from '@/features/suppliers/queries';
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

  const { rows, total } = await listSuppliers({ page, perPage });

  return (
    <AppShell title="Fornecedores" primaryAction={<NewSupplierButton />}>
      <SupplierTable rows={rows} total={total} page={page} perPage={perPage} />
    </AppShell>
  );
}
