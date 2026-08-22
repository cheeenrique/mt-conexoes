'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Layers, Plus } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { CYCLE_LABELS } from '@/lib/labels';
import { PlanDrawer } from './plan-drawer';
import type { PlanDTO } from '../queries';

function cycleLabel(cycle: string): string {
  return CYCLE_LABELS[cycle] ?? cycle;
}

export function PlanTable({
  rows,
  total,
  page,
  perPage,
  suppliers,
}: {
  rows: PlanDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<PlanDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/plans?${params.toString()}`);
  }

  const columns: Column<PlanDTO>[] = [
    {
      header: 'Plano',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className={row.isActive ? undefined : 'text-foreground-muted'}>{row.name}</span>
          {!row.isActive && <span className="text-xs text-foreground-muted">desativado</span>}
        </div>
      ),
    },
    { header: 'Ciclo', cell: (row) => cycleLabel(row.cycle) },
    { header: 'Preço sugerido', align: 'right', cell: (row) => formatCents(row.priceCents) },
    { header: 'Custo sugerido', align: 'right', cell: (row) => formatCents(row.costCents) },
    { header: 'Fornecedor', cell: (row) => row.supplierName ?? '—' },
    { header: 'Assinaturas ativas', align: 'right', cell: (row) => String(row.activeSubscriptionsCount) },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar plano"
          title="Editar plano"
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
            icon={Layers}
            title="Nenhum plano cadastrado"
            description="Cadastre os pacotes comerciais vendidos aos clientes."
            action={
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                <Plus aria-hidden="true" />
                Cadastrar o primeiro
              </Button>
            }
          />
        }
      />
      {rows.length > 0 && (
        <p className="-mt-px rounded-b border border-t-0 border-border bg-surface px-4 py-2.5 text-xs text-foreground-muted">
          Preço e custo aqui são sugestão para preencher o formulário. O valor que vale é o negociado em cada
          assinatura; editar o plano não muda o que ninguém paga.
        </p>
      )}
      <PlanDrawer open={drawerOpen} onOpenChange={setDrawerOpen} plan={editing} suppliers={suppliers} />
    </>
  );
}
