import type { ReactNode } from 'react';
import { formatCents, formatPercent } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { marginToneClass } from '@/lib/margin-tone';
import type { MonthlySummaryDTO } from '../queries';

function SummaryFigure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[.06em] text-foreground-muted">{label}</p>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-mono">{children}</p>
    </div>
  );
}

/**
 * Resumo do mês — primeiro bloco do Início e topo de Relatórios.
 * Cinco números na mesma competência: faturado e custo vêm das cobranças
 * emitidas no mês, recebido vem dos pagamentos. Ver `04-dinheiro-e-margem.md`.
 */
export function MonthlySummaryCard({ summary, monthLabel }: { summary: MonthlySummaryDTO; monthLabel: string }) {
  const billedCents = BigInt(summary.billedCents);
  const costCents = BigInt(summary.costCents);
  const profitCents = billedCents - costCents;
  const margin = marginPercent(billedCents, costCents);
  const costAtRiskCents = BigInt(summary.costAtRiskCents);

  return (
    <section className="rounded border border-border bg-surface p-4">
      <p className="text-[13px] font-semibold uppercase tracking-[.06em] text-foreground-muted">{monthLabel}</p>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        <SummaryFigure label="Faturado">
          <span className="text-foreground">{formatCents(summary.billedCents)}</span>
        </SummaryFigure>
        <SummaryFigure label="Recebido">
          <span className="text-foreground">{formatCents(summary.receivedCents)}</span>
        </SummaryFigure>
        <SummaryFigure label="Custo">
          <span className="text-foreground">{formatCents(summary.costCents)}</span>
        </SummaryFigure>
        <SummaryFigure label="Lucro bruto">
          <span className="text-foreground">{formatCents(profitCents)}</span>
        </SummaryFigure>
        <SummaryFigure label="Margem">
          <span className={marginToneClass(margin)}>{formatPercent(margin)}</span>
        </SummaryFigure>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-border pt-3 text-[13px]">
        <p className="text-foreground-muted">
          Em aberto{' '}
          <span className="font-mono font-semibold tabular-mono text-foreground">{formatCents(summary.openCents)}</span>
        </p>
        {costAtRiskCents > 0n && (
          <>
            <p className="text-foreground-muted">
              Margem em risco{' '}
              <span className="font-mono font-semibold tabular-mono text-warning">{formatCents(summary.costAtRiskCents)}</span>
            </p>
            {/* O conceito que mais confunde: não é lucro previsto, é dinheiro que já saiu. */}
            <p className="text-foreground-muted">Custo já pago ao fornecedor sobre cobranças não recebidas.</p>
          </>
        )}
      </div>
    </section>
  );
}
