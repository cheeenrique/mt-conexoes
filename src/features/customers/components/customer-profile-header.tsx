import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { StatusBadge } from '@/components/ui/status-badge';
import type { CustomerPnlDTO } from '@/features/reports/queries';

export function CustomerProfileHeader({
  name,
  supplierName,
  since,
  active,
  pnl,
}: {
  name: string;
  supplierName: string | null;
  since: string;
  active: boolean;
  pnl: CustomerPnlDTO;
}) {
  const billedCents = BigInt(pnl.billedCents);
  const costCents = BigInt(pnl.costCents);
  const profitCents = billedCents - costCents;
  const margin = marginPercent(billedCents, costCents);
  const atrasoLabel = pnl.overdueCount === 1 ? 'atraso' : 'atrasos';

  return (
    <div className="rounded border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-lg font-bold text-foreground">{name}</p>
          <p className="text-sm text-foreground-muted">
            {supplierName ? `Fornecedor: ${supplierName} · ` : ''}cliente desde {since}
          </p>
        </div>
        <StatusBadge tone={active ? 'success' : 'neutral'}>{active ? 'ATIVO' : 'SEM ASSINATURA'}</StatusBadge>
      </div>
      <div className="grid grid-cols-4 gap-4 border-t border-border pt-4 font-mono text-sm tabular-mono">
        <div>
          <p className="text-xs text-foreground-muted">Faturado</p>
          <p className="text-foreground">{formatCents(pnl.billedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(pnl.receivedCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(pnl.costCents)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro bruto</p>
          <p className="text-foreground">
            {formatCents(profitCents)}
            {margin !== null && <span className="ml-2 text-xs text-foreground-muted">margem {margin.toFixed(0)}%</span>}
            {margin === null && <span className="ml-2 text-xs text-foreground-muted">—</span>}
          </p>
        </div>
      </div>
      {pnl.chargesCount > 0 && (
        <div className="mt-3 flex gap-6 text-xs text-foreground-muted">
          <span>Renovações {pnl.paidCount}</span>
          <span>Histórico {pnl.overdueCount} {atrasoLabel} · {pnl.openCount} em aberto</span>
        </div>
      )}
    </div>
  );
}
