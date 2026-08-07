'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Layers } from 'lucide-react';
import Decimal from 'decimal.js';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { marginPercent } from '@/core/money';
import { CYCLE_LABELS } from '@/lib/labels';
import { PlanDrawer } from './plan-drawer';
import type { PlanDTO } from '../queries';

function marginTone(pct: Decimal | null): 'success' | 'warning' | 'danger' | 'neutral' {
  if (pct === null) return 'neutral';
  if (pct.gte(40)) return 'success';
  if (pct.gte(15)) return 'warning';
  return 'danger';
}

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
          <span>{row.name}</span>
          <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
            {row.isActive ? 'Ativo' : 'Inativo'}
          </StatusBadge>
        </div>
      ),
    },
    { header: 'Ciclo', cell: (row) => cycleLabel(row.cycle) },
    { header: 'Preço', align: 'right', cell: (row) => formatCents(row.priceCents) },
    { header: 'Custo', align: 'right', cell: (row) => formatCents(row.costCents) },
    {
      header: 'Margem',
      align: 'right',
      cell: (row) => {
        const pct = marginPercent(BigInt(row.priceCents), BigInt(row.costCents));
        return <StatusBadge tone={marginTone(pct)}>{pct === null ? '—' : `${pct.toFixed(1)}%`}</StatusBadge>;
      },
    },
    { header: 'Assinaturas ativas', align: 'right', cell: () => '0' },
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
            action={<Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>Cadastrar o primeiro</Button>}
          />
        }
      />
      <PlanDrawer open={drawerOpen} onOpenChange={setDrawerOpen} plan={editing} suppliers={suppliers} />
    </>
  );
}
