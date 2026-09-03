'use client';

import Link from 'next/link';
import { PhoneOff } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import type { ImportSummaryDTO } from '../types';
import { SummaryStat } from './summary-stat';

/** Resultado depois da gravação real (confirmação da Etapa 2). */
export function ImportResultStep({ summary, onRestart }: { summary: ImportSummaryDTO; onRestart: () => void }) {
  const phoneWarnings = summary.imported.filter((row) => row.phoneIssue);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryStat label="Linhas" value={summary.totalRows} />
        <SummaryStat label="Importadas" value={summary.imported.length} />
        <SummaryStat label="Já existiam" value={summary.skipped.length} />
        <SummaryStat label="Recusadas" value={summary.rejected.length} />
      </div>
      <p className="text-sm text-foreground-muted">Soma importada: {formatCents(summary.importedTotalCents)}</p>

      {phoneWarnings.length > 0 && (
        <Alert tone="warning" icon={PhoneOff}>
          <p className="font-medium">
            {phoneWarnings.length} cliente{phoneWarnings.length === 1 ? '' : 's'} importado
            {phoneWarnings.length === 1 ? '' : 's'} sem telefone — a régua não manda cobrança nenhuma pra eles até
            alguém cadastrar o WhatsApp na ficha.
          </p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {phoneWarnings.map((row) => (
              <li key={row.identifier}>{row.identifier}</li>
            ))}
          </ul>
        </Alert>
      )}

      {summary.rejected.length > 0 && (
        <div>
          <p className="text-sm font-medium text-danger">Recusadas</p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto text-sm text-foreground-muted">
            {summary.rejected.map((row, index) => (
              <li key={`${row.identifier}-${index}`}>
                {row.identifier}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onRestart}>
          Importar outro arquivo
        </Button>
        <Button type="button" nativeButton={false} render={<Link href="/customers" />}>
          Ver clientes
        </Button>
      </div>
    </div>
  );
}
