import type { MarginAlertSummary } from '../queries';

export function MarginAlertBanner({ summary }: { summary: MarginAlertSummary }) {
  if (summary.negativeCount === 0 && summary.belowThresholdCount === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {summary.negativeCount > 0 && (
        <div className="rounded-sm border border-danger/40 bg-danger/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.negativeCount} assinatura{summary.negativeCount > 1 ? 's' : ''} com margem negativa
          </p>
          <p className="text-sm text-foreground-muted">Vendendo abaixo do custo. Revisar preço ou custo.</p>
        </div>
      )}
      {summary.belowThresholdCount > 0 && (
        <div className="rounded-sm border border-warning/40 bg-warning/[.08] p-4">
          <p className="text-sm font-bold text-foreground">
            {summary.belowThresholdCount} assinatura{summary.belowThresholdCount > 1 ? 's' : ''} com margem abaixo do limite
          </p>
        </div>
      )}
    </div>
  );
}
