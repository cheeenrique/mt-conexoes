import { Receipt } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { listCharges } from '@/features/charges/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { ChargeFilters } from '@/features/charges/components/charge-filters';
import { ChargeTable } from '@/features/charges/components/charge-table';
import { SendMessageButton } from '@/features/messaging/components/send-message-button';
import { startOfLocalDay, endOfLocalDay, defaultDateRangeLocal } from '@/core/dates';

/** Converte 'YYYY-MM-DD' em limite de dia local, sem cair na armadilha do fuso do navegador. */
function parseLocalDateBoundary(value: string | undefined, timezone: string, boundary: 'start' | 'end') {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const fn = boundary === 'start' ? startOfLocalDay : endOfLocalDay;
  return fn(year, month - 1, day, timezone);
}

/** Deduplica por customerId — usado tanto na página quanto na lista completa de destinatários. */
function uniqueRecipientsFrom(rows: { customerId: string; customerName: string }[]) {
  return Array.from(new Map(rows.map((r) => [r.customerId, { id: r.customerId, name: r.customerName }])).values());
}

// Acima de qualquer base realista do projeto (CLAUDE.md: "até 1.000 assinantes").
const RECIPIENTS_FETCH_PER_PAGE = 2000;

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
  const settings = await getSettings();

  // Link "cru" (sem recorte de data): nasce com os últimos 30 dias, no fuso
  // do negócio, e a URL vira a canônica — quem recebe o link compartilhado
  // vê o mesmo recorte, não a lista inteira sem filtro nenhum. `dueFrom`/
  // `dueTo` presentes (mesmo vazios, via "Limpar") nunca disparam este redirect.
  if (params.dueFrom === undefined && params.dueTo === undefined) {
    const { from, to } = defaultDateRangeLocal(new Date(), settings.timezone);
    const canonical = new URLSearchParams();
    if (params.status) canonical.set('status', params.status);
    if (params.customerId) canonical.set('customerId', params.customerId);
    if (params.supplierId) canonical.set('supplierId', params.supplierId);
    canonical.set('dueFrom', from);
    canonical.set('dueTo', to);
    redirect(`/charges?${canonical.toString()}`);
  }

  const status = params.status ?? '';
  const customerId = params.customerId ?? '';
  const supplierId = params.supplierId ?? '';
  const dueFrom = params.dueFrom ?? '';
  const dueTo = params.dueTo ?? '';

  const filters = {
    status: status || undefined,
    customerId: customerId || undefined,
    supplierId: supplierId || undefined,
    dueFrom: parseLocalDateBoundary(dueFrom, settings.timezone, 'start'),
    dueTo: parseLocalDateBoundary(dueTo, settings.timezone, 'end'),
  };
  const [{ rows, nextCursor }, { rows: allFilteredRows }, suppliers] = await Promise.all([
    listCharges({ ...filters, cursor: params.cursor || undefined }),
    listCharges({ ...filters, perPage: RECIPIENTS_FETCH_PER_PAGE }),
    listActiveSuppliersForSelect(),
  ]);

  // Destinatários vêm do filtro inteiro, não só da página visível na tabela —
  // senão o botão de envio manual só alcança as 20 linhas da página atual.
  const uniqueRecipients = uniqueRecipientsFrom(allFilteredRows);

  return (
    <AppShell title="Cobranças" icon={<Receipt size={22} />}>
      <div className="flex items-center justify-between gap-4">
        <ChargeFilters
          status={status}
          customerId={customerId}
          supplierId={supplierId}
          dueFrom={dueFrom}
          dueTo={dueTo}
          suppliers={suppliers}
        />
        <SendMessageButton recipients={uniqueRecipients} />
      </div>
      <ChargeTable rows={rows} nextCursor={nextCursor} timezone={settings.timezone} />
    </AppShell>
  );
}
