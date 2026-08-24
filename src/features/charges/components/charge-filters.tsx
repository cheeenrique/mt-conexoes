'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DateRangeInput } from '@/components/ui/date-range-input';
import { Select } from '@/components/ui/select';
import { CHARGE_STATUS_OPTIONS } from '@/lib/labels';

export function ChargeFilters({
  status,
  customerId,
  supplierId,
  dueFrom,
  dueTo,
  suppliers,
}: {
  status: string;
  customerId: string;
  supplierId: string;
  dueFrom: string;
  dueTo: string;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('cursor');
    router.push(`/charges?${params.toString()}`);
  }

  // `dueFrom`/`dueTo` nunca somem da URL, mesmo vazios — sumir faria a página
  // reaplicar o padrão de 30 dias no próximo load (ver `ChargesPage`), o que
  // reverteria em silêncio um "ver tudo" que o operador pediu de propósito.
  function setDateParam(key: 'dueFrom' | 'dueTo', value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    params.delete('cursor');
    router.push(`/charges?${params.toString()}`);
  }

  function clearDateRange() {
    const params = new URLSearchParams(searchParams);
    params.set('dueFrom', '');
    params.set('dueTo', '');
    params.delete('cursor');
    router.push(`/charges?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex h-11 items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" />
        <input
          defaultValue={customerId}
          onChange={(e) => setParam('customerId', e.target.value)}
          placeholder="ID do cliente"
          className="h-full w-40 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
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
