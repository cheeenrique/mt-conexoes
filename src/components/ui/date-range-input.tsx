'use client';

import { CalendarRange, X } from 'lucide-react';
import { IMaskInput } from 'react-imask';

import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` (ou vazio) → `DD/MM/AAAA` pro IMaskInput exibir. */
function toDisplay(iso: string): string {
  return iso ? iso.split('-').reverse().join('/') : '';
}

/**
 * Uma caixa só pra "de" e "até", com "até" escrito entre os dois campos —
 * o par de `<input type="date">` solto não deixava claro que eram os dois
 * extremos do mesmo recorte. Mascarado em dd/MM/yyyy (nunca `type="date"`,
 * que segue o locale do navegador e já vazou `mm/dd/yyyy` pra tela).
 */
export function DateRangeInput({
  id,
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
}: {
  id?: string;
  from: string;
  to: string;
  onFromChange: (iso: string) => void;
  onToChange: (iso: string) => void;
  onClear: () => void;
}) {
  const hasValue = Boolean(from || to);

  function acceptTo(setter: (iso: string) => void) {
    return (masked: string) => {
      const [day, month, year] = masked.split('/');
      if (day && month && year?.length === 4) {
        setter(`${year}-${month}-${day}`);
      } else if (!day && !month && !year) {
        setter('');
      }
    };
  }

  return (
    <div
      id={id}
      className="flex h-11 items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
    >
      <CalendarRange size={16} className="shrink-0 text-foreground-muted" aria-hidden="true" />
      <IMaskInput
        mask="00/00/0000"
        value={toDisplay(from)}
        unmask={false}
        onAccept={acceptTo(onFromChange)}
        aria-label="Vencimento de"
        placeholder="DD/MM/AAAA"
        className="w-[86px] bg-transparent font-mono tabular-mono text-foreground outline-none placeholder:text-foreground-muted"
      />
      <span className="text-foreground-muted" aria-hidden="true">
        até
      </span>
      <IMaskInput
        mask="00/00/0000"
        value={toDisplay(to)}
        unmask={false}
        onAccept={acceptTo(onToChange)}
        aria-label="Vencimento até"
        placeholder="DD/MM/AAAA"
        className="w-[86px] bg-transparent font-mono tabular-mono text-foreground outline-none placeholder:text-foreground-muted"
      />
      <button
        type="button"
        onClick={onClear}
        aria-label="Limpar período"
        disabled={!hasValue}
        className={cn(
          'ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-badge text-foreground-muted',
          'hover:text-foreground disabled:pointer-events-none disabled:opacity-0',
        )}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
