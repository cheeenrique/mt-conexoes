import { AppShell } from '@/components/layout/app-shell';
import { listCharges } from '@/features/charges/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/features/settings/queries';
import { ChargeFilters } from '@/features/charges/components/charge-filters';
import { ChargeTable } from '@/features/charges/components/charge-table';
import { startOfLocalDay, endOfLocalDay } from '@/core/dates';

/** Converte 'YYYY-MM-DD' em limite de dia local, sem cair na armadilha do fuso do navegador. */
function parseLocalDateBoundary(value: string | undefined, timezone: string, boundary: 'start' | 'end') {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const fn = boundary === 'start' ? startOfLocalDay : endOfLocalDay;
  return fn(year, month - 1, day, timezone);
}

export default async function ChargesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    customerId?: string;
    supplierId?: string;
    cursor?: string;
    dueFrom?: string;
    dueTo?: string;
  }>;
}) {
  const params = await searchParams;
  const status = params.status ?? '';
  const customerId = params.customerId ?? '';
  const supplierId = params.supplierId ?? '';
  const dueFrom = params.dueFrom ?? '';
  const dueTo = params.dueTo ?? '';

  const settings = await getSettings();
  const [{ rows, nextCursor }, suppliers] = await Promise.all([
    listCharges({
      status: status || undefined,
      customerId: customerId || undefined,
      supplierId: supplierId || undefined,
      cursor: params.cursor || undefined,
      dueFrom: parseLocalDateBoundary(dueFrom, settings.timezone, 'start'),
      dueTo: parseLocalDateBoundary(dueTo, settings.timezone, 'end'),
    }),
    listActiveSuppliersForSelect(),
  ]);

  return (
    <AppShell title="Cobranças">
      <ChargeFilters
        status={status}
        customerId={customerId}
        supplierId={supplierId}
        dueFrom={dueFrom}
        dueTo={dueTo}
        suppliers={suppliers}
      />
      <ChargeTable rows={rows} nextCursor={nextCursor} timezone={settings.timezone} />
    </AppShell>
  );
}
