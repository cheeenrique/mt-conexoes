import { AppShell } from '@/components/layout/app-shell';
import { listCharges } from '@/features/charges/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/features/settings/queries';
import { ChargeFilters } from '@/features/charges/components/charge-filters';
import { ChargeTable } from '@/features/charges/components/charge-table';

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; customerId?: string; supplierId?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const status = params.status ?? '';
  const customerId = params.customerId ?? '';
  const supplierId = params.supplierId ?? '';

  const [{ rows, nextCursor }, suppliers, settings] = await Promise.all([
    listCharges({
      status: status || undefined,
      customerId: customerId || undefined,
      supplierId: supplierId || undefined,
      cursor: params.cursor || undefined,
    }),
    listActiveSuppliersForSelect(),
    getSettings(),
  ]);

  return (
    <AppShell title="Cobranças">
      <ChargeFilters status={status} customerId={customerId} supplierId={supplierId} suppliers={suppliers} />
      <ChargeTable rows={rows} nextCursor={nextCursor} timezone={settings.timezone} />
    </AppShell>
  );
}
