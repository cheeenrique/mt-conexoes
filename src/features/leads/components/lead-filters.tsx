'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LEAD_STATUS_LABELS } from './lead-status-badge';

const CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'NEW', label: LEAD_STATUS_LABELS.NEW },
  { value: 'CONTACTED', label: LEAD_STATUS_LABELS.CONTACTED },
  { value: 'CONVERTED', label: LEAD_STATUS_LABELS.CONVERTED },
  { value: 'DISCARDED', label: LEAD_STATUS_LABELS.DISCARDED },
] as const;

/** Busca e chips vivem em `searchParams`: o operador compartilha o link e volta pelo histórico. */
export function LeadFilters({ q, status }: { q: string; status: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.push(`/leads?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <label className="flex h-11 min-w-56 flex-1 items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" />
        <span className="sr-only">Buscar lead</span>
        <input
          defaultValue={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Nome, telefone ou origem"
          className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
      </label>
      {CHIPS.map((chip) => {
        const active = status === chip.value;
        return (
          <button
            key={chip.value || 'all'}
            type="button"
            aria-pressed={active}
            onClick={() => setParam('status', chip.value)}
            className={`h-11 rounded-sm border px-3.5 text-sm font-semibold md:h-10 ${
              active
                ? 'border-border-strong bg-surface-elevated text-foreground'
                : 'border-border text-foreground-muted hover:text-foreground'
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
