import { redirect } from 'next/navigation';
import { Inbox } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/lib/settings';
import { countAllLeads, listLeads } from '@/features/leads/queries';
import { leadStatusSchema } from '@/features/leads/schema';
import { LeadFilters } from '@/features/leads/components/lead-filters';
import { LeadTable } from '@/features/leads/components/lead-table';
import { NewLeadButton } from '@/features/leads/components/new-lead-button';
import { listActivePlansForSelect } from '@/features/plans/queries';
import { listActiveSuppliersForSelect } from '@/features/suppliers/queries';
import { findCustomerByPhoneAction } from '../customers/customer-actions';
import { convertLeadAction } from './convert-lead-action';

const PER_PAGE_OPTIONS = [8, 12, 20] as const;

function parsePerPage(value: string | undefined): 8 | 12 | 20 {
  const parsed = Number(value);
  return (PER_PAGE_OPTIONS as readonly number[]).includes(parsed) ? (parsed as 8 | 12 | 20) : 8;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; perPage?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = parsePerPage(params.perPage);
  const q = params.q ?? '';
  const status = leadStatusSchema.safeParse(params.status).data;
  const hasFilter = q !== '' || status !== undefined;

  const [{ rows, total }, totalLeads, settings, plans, suppliers] = await Promise.all([
    listLeads({ page, perPage, q: q || undefined, status }),
    countAllLeads(),
    getSettings(),
    listActivePlansForSelect(),
    listActiveSuppliersForSelect(),
  ]);

  // Página fora do intervalo (link velho, filtro que encolheu a lista) cairia
  // no estado vazio errado — "Nenhum lead ainda" com a base cheia.
  if (rows.length === 0 && total > 0) {
    const firstPage = new URLSearchParams({ perPage: String(perPage) });
    if (q) firstPage.set('q', q);
    if (status) firstPage.set('status', status);
    redirect(`/leads?${firstPage}`);
  }

  return (
    <AppShell title="Leads" icon={<Inbox size={22} />} primaryAction={<NewLeadButton />}>
      <LeadFilters q={q} status={status ?? ''} />
      <LeadTable
        rows={rows}
        total={total}
        page={page}
        perPage={perPage}
        filtered={hasFilter || totalLeads > 0}
        nowIso={new Date().toISOString()}
        timezone={settings.timezone}
        plans={plans}
        suppliers={suppliers}
        convertLead={convertLeadAction}
        checkPhone={findCustomerByPhoneAction}
      />
      <p className="mt-4 text-sm leading-relaxed text-foreground-muted">
        Telefone repetido não é bloqueado: a mesma pessoa pode preencher duas vezes, e esconder o segundo envio
        esconderia um lead real.
      </p>
    </AppShell>
  );
}
