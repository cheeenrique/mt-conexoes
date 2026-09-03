'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { CUSTOMER_SITUATION_FILTERS } from '@/core/customer-situation';
import { CUSTOMER_SITUATION_LABELS } from '@/lib/labels';
import { Select } from '@/components/ui/select';

const DEBOUNCE_MS = 300;

const CHIPS = [
  { value: '', label: 'Todos' },
  ...CUSTOMER_SITUATION_FILTERS.map((value) => ({ value, label: CUSTOMER_SITUATION_LABELS[value] })),
];

function chipClass(selected: boolean): string {
  return selected
    ? 'flex h-10 items-center rounded-badge border border-border-strong bg-surface-elevated px-3 text-sm font-semibold text-foreground'
    : 'flex h-10 items-center rounded-badge border border-border px-3 text-sm font-semibold text-foreground-muted hover:text-foreground';
}

/**
 * Busca e chips de situação da tela de Clientes. Tudo vive em `searchParams`:
 * o operador manda o link do filtro para si mesmo e o botão Voltar funciona.
 *
 * A busca espera 300 ms antes de navegar (handoff 03 §Busca). Sem isso cada
 * tecla vira uma navegação e uma query — digitar "Fernanda" disparava oito.
 */
export function CustomerFilters({
  q,
  situation,
  planId,
  supplierId,
  plans,
  suppliers,
}: {
  q: string;
  situation: string;
  planId: string;
  supplierId: string;
  plans: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function urlWith(key: string, value: string): string {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page'); // filtro novo volta para a página 1
    const query = params.toString();
    return query ? `/customers?${query}` : '/customers';
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Sincroniza o campo com a URL quando ela muda por fora da digitação —
  // "Limpar filtros", botão Voltar, link colado. Escreve no DOM em vez de
  // guardar o texto em estado, e só com o campo sem foco, para não roubar o
  // cursor de quem está no meio de uma palavra.
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== q) input.value = q;
  }, [q]);

  function handleSearch(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.push(urlWith('q', value)), DEBOUNCE_MS);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <div className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-badge border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" aria-hidden />
        <label htmlFor="customer-search" className="sr-only">
          Buscar cliente
        </label>
        <input
          ref={inputRef}
          id="customer-search"
          defaultValue={q}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Nome, telefone ou usuário de acesso"
          className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
        {CHIPS.map((chip) => (
          <button
            key={chip.value || 'all'}
            type="button"
            aria-pressed={situation === chip.value}
            onClick={() => router.push(urlWith('situacao', chip.value))}
            className={chipClass(situation === chip.value)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <Select
        aria-label="Filtrar por plano"
        placeholder="Todos os planos"
        value={planId}
        onValueChange={(next) => router.push(urlWith('plano', next))}
        options={[{ value: '', label: 'Todos os planos' }, ...plans.map((plan) => ({ value: plan.id, label: plan.name }))]}
        className="h-10 w-44"
      />
      <Select
        aria-label="Filtrar por fornecedor"
        placeholder="Todos os fornecedores"
        value={supplierId}
        onValueChange={(next) => router.push(urlWith('fornecedor', next))}
        options={[{ value: '', label: 'Todos os fornecedores' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]}
        className="h-10 w-48"
      />
    </div>
  );
}
