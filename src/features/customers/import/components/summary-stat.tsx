/** Cartão numérico pequeno — usado pela prévia (Etapa 2) e pelo resultado final. */
export function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface-elevated px-3 py-2">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
