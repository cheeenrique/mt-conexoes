import Decimal from 'decimal.js';
import { Banknote, CalendarClock, Percent, TriangleAlert, Users, type LucideIcon } from 'lucide-react';
import { formatCents, formatPercent } from '@/lib/format';
import { marginToneClass } from '@/lib/margin-tone';
import type { DashboardKpisDTO, MonthlySummaryDTO } from '../queries';

function KpiCard({
  icon: Icon,
  label,
  value,
  valueClassName,
  support,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClassName: string;
  support: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded border border-border bg-surface px-4 py-3.5">
      <span className="flex items-center gap-[7px] text-[11px] font-bold uppercase tracking-[.08em] text-foreground-muted">
        <Icon size={14} aria-hidden className="shrink-0" />
        {label}
      </span>
      <span className={`font-mono text-[26px] font-semibold leading-none tabular-mono ${valueClassName}`}>{value}</span>
      <span className="font-mono text-xs tabular-mono text-foreground-muted">{support}</span>
    </div>
  );
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Os cinco KPIs do Início (`telas/02-inicio.md` §2).
 *
 * "Recebido no mês" e o lucro de apoio da margem saem do mesmo resumo do mês
 * mostrado logo acima — mesma competência, sem segunda fonte de verdade.
 *
 * ⚠️ O handoff cita um sexto KPI, "Leads novos". Fica de fora enquanto o
 * modelo `Lead` está sendo criado — ver relatório de divergências.
 */
export function DashboardKpis({ kpis, summary }: { kpis: DashboardKpisDTO; summary: MonthlySummaryDTO }) {
  const profitCents = BigInt(summary.billedCents) - BigInt(summary.costCents);
  const averageMargin = kpis.averageMarginPercent === null ? null : new Decimal(kpis.averageMarginPercent);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <KpiCard
        icon={CalendarClock}
        label="Vencendo hoje"
        value={String(kpis.dueTodayCount)}
        valueClassName="text-warning"
        support={formatCents(kpis.dueTodayCents)}
      />
      <KpiCard
        icon={TriangleAlert}
        label="Em atraso"
        value={String(kpis.overdueCount)}
        valueClassName="text-brand-light"
        support={formatCents(kpis.overdueCents)}
      />
      <KpiCard
        icon={Banknote}
        label="Recebido no mês"
        value={formatCents(summary.receivedCents)}
        valueClassName="text-success"
        support={`${formatCents(summary.openCents)} em aberto`}
      />
      <KpiCard
        icon={Users}
        label="Assinaturas ativas"
        value={String(kpis.activeSubscriptionsCount)}
        valueClassName="text-foreground"
        support={pluralize(kpis.suspendedSubscriptionsCount, 'suspensa', 'suspensas')}
      />
      <KpiCard
        icon={Percent}
        label="Margem média"
        value={formatPercent(averageMargin)}
        valueClassName={marginToneClass(averageMargin)}
        support={`${formatCents(profitCents)} de lucro no mês`}
      />
    </div>
  );
}
