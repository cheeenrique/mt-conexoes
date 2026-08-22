import { marginPercent } from '@/core/money';
import { formatCents, formatLocalMonthYear } from '@/lib/format';
import { marginToneClass } from '@/lib/margin-tone';

/**
 * Primeiro bloco da ficha de propósito (handoff 04): a pergunta do operador ao
 * abrir um cliente é "vale a pena insistir nesse?", e ela se responde com o
 * lucro acumulado, não com o endereço de e-mail.
 */
export function FichaProfit({
  billedCents,
  receivedCents,
  costCents,
  renewalCount,
  sinceAt,
  timezone,
}: {
  billedCents: string;
  receivedCents: string;
  costCents: string;
  renewalCount: number;
  sinceAt: string | null;
  timezone: string;
}) {
  const billed = BigInt(billedCents);
  const cost = BigInt(costCents);
  const profitCents = billed - cost;
  const margin = marginPercent(billed, cost);
  const renewalLabel = renewalCount === 1 ? 'renovação' : 'renovações';

  return (
    <section className="flex flex-col gap-4 rounded border border-border bg-surface p-4">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[.08em] text-foreground-muted">
          Lucro bruto acumulado
        </p>
        <p className={`font-mono text-[30px] font-semibold tabular-mono ${marginToneClass(margin)}`}>
          {formatCents(profitCents)}
        </p>
        <p className="text-[13px] text-foreground-muted">
          {renewalCount} {renewalLabel}
          {margin !== null && ` · margem ${margin.toFixed(0)}%`}
          {sinceAt && ` · cliente desde ${formatLocalMonthYear(sinceAt, timezone)}`}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4">
        {[
          { label: 'Faturado', value: billedCents },
          { label: 'Recebido', value: receivedCents },
          { label: 'Custo', value: costCents },
        ].map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-foreground-muted">{item.label}</dt>
            <dd className="font-mono text-[17px] font-semibold tabular-mono text-foreground">
              {formatCents(item.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
