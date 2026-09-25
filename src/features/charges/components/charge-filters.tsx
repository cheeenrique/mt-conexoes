'use client';

import { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateRangeInput } from '@/components/ui/date-range-input';
import { Select } from '@/components/ui/select';
import { CHARGE_STATUS_OPTIONS } from '@/lib/labels';

const DEBOUNCE_MS = 300;

/**
 * Filtros de Cobranças. A busca é pelo nome ou telefone do cliente — o campo
 * antigo pedia o id, que o operador não tem à mão — e espera 300 ms antes de
 * navegar, como a de Clientes: sem isso cada tecla vira uma navegação e uma query.
 */
export function ChargeFilters({
  q,
  status,
  supplierId,
  dueFrom,
  dueTo,
  suppliers,
}: {
  q: string;
  status: string;
  supplierId: string;
  dueFrom: string;
  dueTo: string;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filtro novo volta para a página 1.
  function push(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams);
    mutate(params);
    params.delete('page');
    router.push(`/charges?${params.toString()}`);
  }

  function setParam(key: string, value: string) {
    push((params) => (value ? params.set(key, value) : params.delete(key)));
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Sincroniza o campo com a URL quando ela muda por fora da digitação (botão
  // Voltar, link colado), só com o campo sem foco, para não roubar o cursor.
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== q) input.value = q;
  }, [q]);

  function handleSearch(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setParam('q', value.trim()), DEBOUNCE_MS);
  }

  // `dueFrom`/`dueTo` nunca somem da URL, mesmo vazios — sumir faria a página
  // reaplicar o padrão de 30 dias no próximo load (ver `ChargesPage`), o que
  // reverteria em silêncio um "ver tudo" que o operador pediu de propósito.
  function setDateParam(key: 'dueFrom' | 'dueTo', value: string) {
    push((params) => params.set(key, value));
  }

  function clearDateRange() {
    push((params) => {
      params.set('dueFrom', '');
      params.set('dueTo', '');
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex h-10 w-64 items-center gap-2 rounded-badge border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" aria-hidden />
        <label htmlFor="charge-search" className="sr-only">
          Buscar cliente
        </label>
        <input
          ref={inputRef}
          id="charge-search"
          defaultValue={q}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Nome ou telefone do cliente"
          className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
      </div>
      <Select
        aria-label="Situação"
        value={status}
        onValueChange={(next) => setParam('status', next)}
        className="w-48"
        options={[{ value: '', label: 'Todas as situações' }, ...CHARGE_STATUS_OPTIONS]}
      />
      <Select
        aria-label="Fornecedor"
        value={supplierId}
        onValueChange={(next) => setParam('supplierId', next)}
        className="w-48"
        options={[{ value: '', label: 'Todos os fornecedores' }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))]}
      />
      <DateRangeInput
        from={dueFrom}
        to={dueTo}
        onFromChange={(next) => setDateParam('dueFrom', next)}
        onToChange={(next) => setDateParam('dueTo', next)}
        onClear={clearDateRange}
      />
    </div>
  );
}
