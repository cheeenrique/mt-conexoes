import { marginPercent } from '@/core/money';
import type { MonthlyTrendRowDTO } from '../queries';
import { formatPercent } from '@/lib/format';

export function MonthlyTrendTable({ rows }: { rows: MonthlyTrendRowDTO[] }) {
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-foreground-muted">
            {rows.map((row) => (
              <th key={`${row.year}-${row.month}`} className="p-3 text-center">{row.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {rows.map((row) => {
              const margin = marginPercent(BigInt(row.billedCents), BigInt(row.costCents));
              return (
                <td key={`${row.year}-${row.month}`} className="p-3 text-center font-mono tabular-mono text-foreground">
                  {formatPercent(margin)}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
