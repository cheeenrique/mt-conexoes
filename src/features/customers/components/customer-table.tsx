'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Search, Users } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { CustomerDrawer } from './customer-drawer';
import type { CustomerListRowDTO } from '../queries';

function formatDueDate(iso: string | null, timezone: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: timezone }).format(new Date(iso));
}

export function CustomerTable({
  rows,
  total,
  page,
  perPage,
  q,
  timezone,
}: {
  rows: CustomerListRowDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
  q: string;
  timezone: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<CustomerListRowDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/customers?${params.toString()}`);
  }

  const columns: Column<CustomerListRowDTO>[] = [
    {
      header: 'Cliente',
      cell: (row) => (
        <div>
          <Link href={`/customers/${row.id}`} className="font-semibold text-foreground hover:text-brand">
            {row.name}
          </Link>
          <p className="font-mono text-xs tabular-mono text-foreground-muted">{row.phone}</p>
        </div>
      ),
    },
    { header: 'Plano', cell: (row) => row.planName ?? '—' },
    { header: 'Fornecedor', cell: (row) => row.supplierName ?? '—' },
    { header: 'Vencimento', align: 'right', cell: (row) => formatDueDate(row.nextDueAt, timezone) },
    { header: 'Situação', cell: () => <StatusBadge tone="neutral">—</StatusBadge> },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar cliente"
          title="Editar cliente"
          onClick={() => { setEditing(row); setDrawerOpen(true); }}
          className="flex h-8 w-8 items-center justify-center rounded-sm border border-border"
        >
          <Pencil size={15} />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3">
        <Search size={16} className="text-foreground-muted" />
        <input
          defaultValue={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Buscar por nome, telefone ou usuário de acesso"
          className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        page={page}
        perPage={perPage}
        total={total}
        onPageChange={(p) => setParam('page', String(p))}
        onPerPageChange={(pp) => setParam('perPage', String(pp))}
        emptyState={
          <EmptyState
            icon={Users}
            title="Nenhum cliente cadastrado"
            description="Cadastre o assinante que usa o serviço."
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Cadastrar o primeiro</Button>}
          />
        }
      />
      <CustomerDrawer open={drawerOpen} onOpenChange={setDrawerOpen} customer={editing} />
    </>
  );
}
