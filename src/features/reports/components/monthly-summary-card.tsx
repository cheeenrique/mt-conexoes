import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import type { MonthlySummaryDTO } from '../queries';

export function MonthlySummaryCard({ summary, monthLabel }: { summary: MonthlySummaryDTO; monthLabel: string }) {
  const billedCents = BigInt(summary.billedCents);
  const costCents = BigInt(summary.costCents);
  const profitCents = billedCents - costCents;
  const margin = marginPercent(billedCents, costCents);
  const costAtRiskCents = BigInt(summary.costAtRiskCents);

  return (
    <div className="rounded border border-border bg-surface p-5">
      <p className="mb-4 text-lg font-bold text-foreground">{monthLabel}</p>
      <div className="grid grid-cols-2 gap-4 font-mono text-sm tabular-mono sm:grid-cols-4">
        <div>
          <p className="text-xs text-foreground-muted">Faturamento</p>
          <p className="text-foreground">{formatCents(summary.billedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(summary.costCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro bruto</p>
          <p className="text-foreground">
            {formatCents(profitCents)}
            {margin !== null && <span className="ml-2 text-xs text-foreground-muted">margem {margin.toFixed(0)}%</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(summary.receivedCents)}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3 font-mono text-sm tabular-mono">
        <p className="text-xs text-foreground-muted">Em aberto</p>
        <p className="text-foreground">
          {formatCents(summary.openCents)}
          {costAtRiskCents > 0n && (
            <span className="ml-2 text-xs text-warning">⚠ margem em risco: {formatCents(summary.costAtRiskCents)}</span>
          )}
        </p>
      </div>
    </div>
  );
}
