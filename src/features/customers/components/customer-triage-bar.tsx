'use client';

import { CUSTOMER_TRIAGE_SITUATIONS, type CustomerTriageSituation } from '@/core/customer-situation';
import { CUSTOMER_SITUATION_LABELS } from '@/lib/labels';
import type { CustomerSituationCounts } from '../queries';

/**
 * Barra de triagem: o número em cima, o rótulo embaixo, o degrau ativo
 * sublinhado. Responde "tem alguém atrasado?" antes do primeiro clique — a
 * pergunta que o operador faz toda vez que abre a tela, e que a fileira de
 * chips anterior só respondia clicando um por um.
 *
 * A cor do número é a mesma do badge da linha, então a barra funciona como
 * legenda da tabela. **Zero é sempre neutro**: vermelho só aparece quando
 * existe atraso de verdade, senão a tela grita todo dia e o operador para de
 * enxergar.
 */
const COUNT_TONE: Record<CustomerTriageSituation, string> = {
  UP_TO_DATE: 'text-success',
  DUE_SOON: 'text-warning',
  DUE_TODAY: 'text-brand-light',
  OVERDUE: 'text-danger',
};

const UNDERLINE_TONE: Record<CustomerTriageSituation, string> = {
  UP_TO_DATE: 'bg-success',
  DUE_SOON: 'bg-warning',
  DUE_TODAY: 'bg-brand-light',
  OVERDUE: 'bg-danger',
};

function TriageItem({
  label,
  count,
  countClass,
  underlineClass,
  selected,
  onSelect,
}: {
  label: string;
  count: number;
  countClass: string;
  underlineClass: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="group flex flex-col items-start gap-1 pt-1 text-left"
    >
      <span className={`font-mono text-2xl leading-none tabular-mono ${count === 0 ? 'text-foreground-muted' : countClass}`}>
        {count}
      </span>
      <span
        className={`text-xs font-semibold ${selected ? 'text-foreground' : 'text-foreground-muted group-hover:text-foreground'}`}
      >
        {label}
      </span>
      {/* Alinhado ao conteúdo, não ao padding: sem px no botão, `w-full` é a
          largura do rótulo, e o traço fica exatamente sob a palavra. */}
      <span aria-hidden className={`mt-1.5 h-[3px] w-full rounded-full ${selected ? underlineClass : 'bg-transparent'}`} />
    </button>
  );
}

export function CustomerTriageBar({
  situation,
  counts,
  onSelect,
}: {
  situation: string;
  counts: CustomerSituationCounts;
  onSelect: (situation: string) => void;
}) {
  return (
    <div
      className="mb-5 flex flex-wrap items-end gap-x-7 gap-y-2 border-b border-border pb-1"
      role="group"
      aria-label="Filtrar por situação"
    >
      <TriageItem
        label="Todos"
        count={counts.ALL}
        countClass="text-foreground"
        underlineClass="bg-foreground"
        selected={situation === ''}
        onSelect={() => onSelect('')}
      />
      {CUSTOMER_TRIAGE_SITUATIONS.map((value) => (
        <TriageItem
          key={value}
          label={CUSTOMER_SITUATION_LABELS[value]}
          count={counts[value]}
          countClass={COUNT_TONE[value]}
          underlineClass={UNDERLINE_TONE[value]}
          selected={situation === value}
          onSelect={() => onSelect(value)}
        />
      ))}
    </div>
  );
}
