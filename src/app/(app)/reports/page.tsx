import Link from 'next/link';
import { AppShell } from '@/components/layout/app-shell';
import { getSettings } from '@/lib/settings';
import { monthBoundsUtc, localDateOnly } from '@/core/dates';
import {
  getMonthlySummary,
  getSupplierBreakdown,
  getPlanBreakdown,
  getCustomerBreakdown,
  getMonthlyTrend,
} from '@/features/reports/queries';
import { MonthlySummaryCard } from '@/features/reports/components/monthly-summary-card';
import { BreakdownTable } from '@/features/reports/components/breakdown-table';
import { MonthlyTrendTable } from '@/features/reports/components/monthly-trend-table';

const MONTH_LABEL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function resolveMonth(searchParams: { year?: string; month?: string }, now: Date, timezone: string) {
  const today = localDateOnly(now, timezone);
  const year = searchParams.year ? Number(searchParams.year) : today.getUTCFullYear();
  const month = searchParams.month ? Number(searchParams.month) - 1 : today.getUTCMonth();
  return { year, month };
}

function adjacentMonthHref(year: number, month: number, delta: number) {
  const offset = month + delta;
  const y = year + Math.floor(offset / 12);
  const m = ((offset % 12) + 12) % 12;
  return `/reports?year=${y}&month=${m + 1}`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const settings = await getSettings();
  const now = new Date();
  const { year, month } = resolveMonth(params, now, settings.timezone);
  const { from, to } = monthBoundsUtc(year, month, settings.timezone);

  const [summary, suppliers, plans, customers, trend] = await Promise.all([
    getMonthlySummary(from, to),
    getSupplierBreakdown(from, to),
    getPlanBreakdown(from, to),
    getCustomerBreakdown(from, to),
    getMonthlyTrend(year, month, settings.timezone),
  ]);

  const monthLabel = `${MONTH_LABEL[month]}/${year}`;

  return (
    <AppShell title="Relatórios">
      <div className="mb-4 flex items-center gap-3">
        <Link href={adjacentMonthHref(year, month, -1)} className="text-sm text-foreground-muted hover:text-foreground">‹ anterior</Link>
        <Link href={adjacentMonthHref(year, month, 1)} className="text-sm text-foreground-muted hover:text-foreground">próximo ›</Link>
      </div>

      <MonthlySummaryCard summary={summary} monthLabel={monthLabel} />

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-foreground">Margem — últimos 12 meses</p>
        <MonthlyTrendTable rows={trend} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Por fornecedor</p>
        <a href={`/api/reports/export?type=supplier&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={suppliers} emptyLabel="Nenhuma cobrança por fornecedor neste mês" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Por plano</p>
        <a href={`/api/reports/export?type=plan&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={plans} emptyLabel="Nenhuma cobrança por plano neste mês" />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">Top 20 clientes</p>
        <a href={`/api/reports/export?type=customer&year=${year}&month=${month + 1}`} className="text-sm text-primary hover:underline">Exportar CSV</a>
      </div>
      <div className="mt-2">
        <BreakdownTable rows={customers.top} emptyLabel="Nenhum cliente com cobrança neste mês" />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm font-bold text-foreground">Bottom 20 clientes</p>
        <BreakdownTable rows={customers.bottom} emptyLabel="Nenhum cliente com cobrança neste mês" />
      </div>
    </AppShell>
  );
}
