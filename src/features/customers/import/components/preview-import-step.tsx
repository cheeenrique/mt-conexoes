'use client';

import { Check, Loader2, PhoneOff } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatCents, formatLocalDate, formatPercent } from '@/lib/format';
import type { ImportPlanDTO } from '../types';
import { SummaryStat } from './summary-stat';

/**
 * Etapa 2: conferência, sem gravar nada. `fileName` + `plan.totalRows` no
 * topo é a confirmação de que o arquivo lido é o que o operador escolheu.
 */
export function PreviewImportStep({
  fileName,
  plan,
  timezone,
  submitting,
  onBack,
  onConfirm,
}: {
  fileName: string;
  plan: ImportPlanDTO;
  timezone: string;
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const phoneWarnings = plan.toImport.filter((row) => row.phoneIssue !== null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground-muted">
        {fileName} — {plan.totalRows} linha{plan.totalRows === 1 ? '' : 's'} lida{plan.totalRows === 1 ? '' : 's'}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <SummaryStat label="Novas" value={plan.toImport.length} />
        <SummaryStat label="Já existem" value={plan.alreadyExistsCount} />
        <SummaryStat label="Recusadas" value={plan.rejected.length} />
      </div>

      <p className="text-sm text-foreground-muted">
        Soma a importar: {formatCents(plan.importTotalCents)} · Margem média:{' '}
        {formatPercent(plan.averageMarginPercent, 1)}
      </p>

      {plan.toImport.length > 0 && <PreviewTable rows={plan.toImport} timezone={timezone} />}

      {phoneWarnings.length > 0 && (
        <Alert tone="warning" icon={PhoneOff}>
          <p className="font-medium">
            {phoneWarnings.length} cliente{phoneWarnings.length === 1 ? '' : 's'} sem telefone — a régua não manda
            cobrança nenhuma pra quem não tem WhatsApp cadastrado.
          </p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {phoneWarnings.map((row) => (
              <li key={row.identifier}>{row.identifier}</li>
            ))}
          </ul>
        </Alert>
      )}

      {plan.rejected.length > 0 && (
        <div>
          <p className="text-sm font-medium text-danger">Recusadas</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-sm text-foreground-muted">
            {plan.rejected.map((row, index) => (
              <li key={`${row.identifier}-${index}`}>
                {row.identifier}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={submitting}>
          Voltar
        </Button>
        <Button type="button" onClick={onConfirm} disabled={submitting || plan.toImport.length === 0}>
          {submitting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
          {submitting ? 'Importando...' : `Importar ${plan.toImport.length} cliente(s)`}
        </Button>
      </div>
    </div>
  );
}

function PreviewTable({ rows, timezone }: { rows: ImportPlanDTO['toImport']; timezone: string }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-elevated text-xs text-foreground-muted">
          <tr>
            <th className="px-3 py-2 text-left">Cliente</th>
            <th className="px-3 py-2 text-left">Usuário</th>
            <th className="px-3 py-2 text-right">Valor</th>
            <th className="px-3 py-2 text-right">Custo</th>
            <th className="px-3 py-2 text-right">Margem</th>
            <th className="px-3 py-2 text-right">Vencimento</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.identifier}-${index}`} className="border-t border-border">
              <td className="px-3 py-2 text-foreground">
                <div className="flex items-center gap-2">
                  <span>{row.identifier}</span>
                  {row.phoneIssue && (
                    <StatusBadge tone="warning">
                      {row.phoneIssue === 'missing' ? 'Sem telefone' : 'Telefone inválido'}
                    </StatusBadge>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-foreground-muted">{row.username ?? '—'}</td>
              <td className="px-3 py-2 text-right font-mono tabular-mono text-foreground">
                {formatCents(row.priceCents)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-mono text-foreground">
                {formatCents(row.costCents)}
              </td>
              <td className="px-3 py-2 text-right text-foreground">{formatPercent(row.marginPercent, 1)}</td>
              <td className="px-3 py-2 text-right text-foreground">{formatLocalDate(row.dueAt, timezone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
