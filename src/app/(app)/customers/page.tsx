import { AppShell } from '@/components/layout/app-shell';
import { listCustomers } from '@/features/customers/queries';
import { CustomerTable } from '@/features/customers/components/customer-table';
import { NewCustomerButton } from '@/features/customers/components/new-customer-button';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = (PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? Number(params.perPage)
    : 8) as 8 | 12 | 20;
  const q = params.q ?? '';

  const { rows, total } = await listCustomers({ page, perPage, q: q || undefined });

  return (
    <AppShell title="Clientes" primaryAction={<NewCustomerButton />}>
      <CustomerTable rows={rows} total={total} page={page} perPage={perPage} q={q} />
    </AppShell>
  );
}
