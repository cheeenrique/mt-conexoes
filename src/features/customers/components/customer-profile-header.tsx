import { formatCents } from '@/lib/format';
import { StatusBadge } from '@/components/ui/status-badge';

export function CustomerProfileHeader({
  name,
  supplierName,
  since,
  active,
}: {
  name: string;
  supplierName: string | null;
  since: string;
  active: boolean;
}) {
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
      {/* TODO Etapa 2: SUM(charge.principalCents - discountCents) e SUM(charge.costCents) por
          customerId, ver docs/projeto/tecnico/04-dinheiro-e-margem.md. Sem Charge ainda, os
          números abaixo são zero de verdade, não um placeholder de UI. */}
      <div className="grid grid-cols-5 gap-4 border-t border-border pt-4 font-mono text-sm tabular-mono">
        <div>
          <p className="text-xs text-foreground-muted">Faturado</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Recebido</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Custo</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Lucro</p>
          <p className="text-foreground">{formatCents(0n)}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-muted">Margem</p>
          <p className="text-foreground">—</p>
        </div>
      </div>
    </div>
  );
}
