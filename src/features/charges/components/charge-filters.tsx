'use client';

import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CHARGE_STATUS_OPTIONS } from '@/lib/labels';

export function ChargeFilters({
  status,
  customerId,
  supplierId,
  suppliers,
}: {
  status: string;
  customerId: string;
  supplierId: string;
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
      <select
        aria-label="Situação"
        value={status}
        onChange={(e) => setParam('status', e.target.value)}
        className="h-11 rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
      >
        <option value="">Todas as situações</option>
        {CHARGE_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Fornecedor"
        value={supplierId}
        onChange={(e) => setParam('supplierId', e.target.value)}
        className="h-11 rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground"
      >
        <option value="">Todos os fornecedores</option>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}
