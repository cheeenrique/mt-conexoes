import { Receipt } from 'lucide-react';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { listCharges } from '@/features/charges/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { getSettings } from '@/lib/settings';
import { ChargeFilters } from '@/features/charges/components/charge-filters';
import { ChargeTable } from '@/features/charges/components/charge-table';
import { SendMessageButton } from '@/features/messaging/components/send-message-button';
import { defaultDateRangeLocal } from '@/core/dates';
import { parseChargesSearchParams, type ChargesSearchParams } from './search-params';

/** Deduplica por customerId — usado tanto na página quanto na lista completa de destinatários. */
function uniqueRecipientsFrom(rows: { customerId: string; customerName: string }[]) {
  return Array.from(new Map(rows.map((r) => [r.customerId, { id: r.customerId, name: r.customerName }])).values());
}

// Acima de qualquer base realista do projeto (CLAUDE.md: "até 1.000 assinantes").
const RECIPIENTS_FETCH_PER_PAGE = 2000;

export default async function ChargesPage({ searchParams }: { searchParams: Promise<ChargesSearchParams> }) {
  const params = await searchParams;
  const settings = await getSettings();

  // Link "cru" (sem recorte de data): nasce com os últimos 30 dias, no fuso
  // do negócio, e a URL vira a canônica — quem recebe o link compartilhado
  // vê o mesmo recorte, não a lista inteira sem filtro nenhum. `dueFrom`/
  // `dueTo` presentes (mesmo vazios, via "Limpar") nunca disparam este redirect.
  if (params.dueFrom === undefined && params.dueTo === undefined) {
    const { from, to } = defaultDateRangeLocal(new Date(), settings.timezone);
    const canonical = new URLSearchParams();
    for (const key of ['q', 'status', 'supplierId', 'perPage'] as const) {
      if (params[key]) canonical.set(key, params[key]);
    }
    canonical.set('dueFrom', from);
    canonical.set('dueTo', to);
    redirect(`/charges?${canonical.toString()}`);
  }

  const { page, perPage, raw, filters, filtered } = parseChargesSearchParams(params, settings.timezone);
  const [{ rows, total }, { rows: allFilteredRows }, suppliers] = await Promise.all([
    listCharges({ ...filters, page, perPage }),
    listCharges({ ...filters, page: 1, perPage: RECIPIENTS_FETCH_PER_PAGE }),
    listActiveSuppliersForSelect(),
  ]);

  // Destinatários vêm do filtro inteiro, não só da página visível na tabela —
  // senão o botão de envio manual só alcança as 20 linhas da página atual.
  const uniqueRecipients = uniqueRecipientsFrom(allFilteredRows);

  return (
    <AppShell title="Cobranças" icon={<Receipt size={22} />}>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <ChargeFilters {...raw} suppliers={suppliers} />
        <div className="mb-4">
          <SendMessageButton recipients={uniqueRecipients} />
        </div>
      </div>
      <ChargeTable
        rows={rows}
        total={total}
        page={page}
        perPage={perPage}
        filtered={filtered}
        timezone={settings.timezone}
      />
    </AppShell>
  );
}
