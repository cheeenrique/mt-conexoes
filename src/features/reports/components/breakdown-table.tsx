import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { EmptyState } from '@/components/ui/empty-state';
import { FileBarChart } from 'lucide-react';
import type { BreakdownRowDTO } from '../queries';

export function BreakdownTable({ rows, emptyLabel }: { rows: BreakdownRowDTO[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return <EmptyState icon={FileBarChart} title={emptyLabel} description="Nenhum lançamento no período selecionado." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            <th className="p-3">Nome</th>
            <th className="p-3 text-right">Faturado</th>
            <th className="p-3 text-right">Custo</th>
            <th className="p-3 text-right">Lucro bruto</th>
            <th className="p-3 text-right">Margem</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const billedCents = BigInt(row.billedCents);
            const costCents = BigInt(row.costCents);
            const profitCents = billedCents - costCents;
            const margin = marginPercent(billedCents, costCents);
            return (
              <tr key={row.id} className="border-b border-border font-mono tabular-mono last:border-0">
                <td className="p-3 font-sans text-foreground">{row.name}</td>
                <td className="p-3 text-right text-foreground">{formatCents(row.billedCents)}</td>
                <td className="p-3 text-right text-foreground">{formatCents(row.costCents)}</td>
                <td className="p-3 text-right text-foreground">{formatCents(profitCents)}</td>
                <td className="p-3 text-right text-foreground">{margin === null ? '—' : `${margin.toFixed(0)}%`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
