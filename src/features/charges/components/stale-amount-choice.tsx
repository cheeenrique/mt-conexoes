'use client';

import { formatCents } from '@/lib/format';
import { CYCLE_LABELS } from '@/lib/labels';

export type AmountChoice = 'charge' | 'plan';

function cycleLabel(cycle: string): string {
  return CYCLE_LABELS[cycle] ?? cycle;
}

/**
 * "Qual valor vale para esta cobrança?" — só aparece quando a cobrança ficou
 * com o valor de um plano anterior (`isStaleAmount`).
 *
 * Relatado em 25/09/2026: o cliente mensal de R$ 35,00 virou trimestral de
 * R$ 75,00, o diálogo preenchia R$ 35,00 e recusava os R$ 75,00 que ele pagou.
 * Nenhuma opção vem marcada: reajuste combinado para o próximo ciclo também
 * deixa a cobrança com o valor anterior, e ali o certo é o valor da cobrança.
 * Só o operador sabe qual dos dois casos é o dele.
 */
export function StaleAmountChoice({
  chargeCents,
  planCents,
  cycle,
  value,
  onChange,
  error,
}: {
  chargeCents: string;
  planCents: string;
  cycle: string;
  value: AmountChoice | null;
  onChange: (choice: AmountChoice) => void;
  error?: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Qual valor vale para esta cobrança?</legend>
      <AmountOption
        checked={value === 'charge'}
        onSelect={() => onChange('charge')}
        title={`Valor desta cobrança — ${formatCents(chargeCents)}`}
        detail="Emitida com o plano ou o preço anterior."
      />
      <AmountOption
        checked={value === 'plan'}
        onSelect={() => onChange('plan')}
        title={`Valor do plano atual — ${formatCents(planCents)} · ${cycleLabel(cycle)}`}
        detail="A cobrança passa para o preço e o custo do plano atual antes de registrar o pagamento."
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </fieldset>
  );
}

function AmountOption({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-border bg-surface-elevated p-3 has-[:checked]:border-brand">
      <input type="radio" name="amountChoice" checked={checked} onChange={onSelect} className="mt-0.5 size-4 shrink-0 accent-brand" />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs text-foreground-muted">{detail}</span>
      </span>
    </label>
  );
}

/**
 * Perto do "Próximo vencimento": a sugestão conta o ciclo do plano de hoje,
 * não o da cobrança. Quitar os R$ 35,00 do mensal numa assinatura que já é
 * trimestral sugere três meses à frente — o campo continua editável, isto só
 * deixa a conta à vista antes de confirmar.
 */
export function StaleCycleNote({ cycle, choice }: { cycle: string; choice: AmountChoice | null }) {
  const text = `O próximo vencimento conta um ciclo ${cycleLabel(cycle).toLowerCase()}, o do plano atual.`;
  if (choice !== 'charge') return <p className="text-xs text-foreground-muted">{text}</p>;
  return (
    <p className="text-xs text-warning">
      {text} O valor escolhido é o da cobrança anterior: se ele cobre um período menor, troque a data.
    </p>
  );
}
