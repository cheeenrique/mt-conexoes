import Link from 'next/link';
import { RuleStatusBadge } from './rule-status-badge';
import type { DunningRuleListItemDTO } from '../queries';

/**
 * Coluna mestre. Server Component de propósito: a seleção vive em
 * `searchParams`, então cada cartão é só um link — o operador manda o link da
 * régua que está olhando e volta pelo histórico do navegador.
 *
 * ⚠️ O cartão só seleciona. "Tornar padrão", "Pausar" e "Retomar" ficam no
 * corpo do detalhe (handoff `telas/07-reguas.md` §Checklist), para que clicar
 * numa régua da lista nunca seja confundido com agir sobre ela.
 */
export function RuleList({ rules, selectedId }: { rules: DunningRuleListItemDTO[]; selectedId: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <span className="text-[11px] font-bold uppercase tracking-[.08em] text-foreground-muted">Réguas</span>
      {rules.map((rule) => {
        const selected = rule.id === selectedId;
        return (
          <Link
            key={rule.id}
            href={`/regua?regua=${rule.id}`}
            aria-current={selected ? 'true' : undefined}
            className={`flex flex-col gap-2 rounded border p-3 text-left transition-colors ${
              selected
                ? 'border-border-strong bg-surface-elevated'
                : 'border-border bg-surface hover:border-border-strong'
            }`}
          >
            <span className="flex items-center justify-between gap-2.5">
              <span className="truncate text-[15px] font-bold text-foreground">{rule.name}</span>
              <RuleStatusBadge status={rule.status} />
            </span>
            <span className="flex items-center gap-2">
              {rule.isDefault && (
                <span className="inline-flex h-5 items-center rounded-badge bg-brand/[.14] px-1.5 text-[11px] font-bold tracking-[.06em] text-brand-light">
                  PADRÃO
                </span>
              )}
              <span className="font-mono text-xs tabular-mono text-foreground-muted">
                {rule.stepCount} {rule.stepCount === 1 ? 'passo' : 'passos'}
              </span>
            </span>
          </Link>
        );
      })}
    </section>
  );
}
