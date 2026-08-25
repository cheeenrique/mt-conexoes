'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Plus, Truck } from 'lucide-react';
import Decimal from 'decimal.js';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { formatCents, formatPercent } from '@/lib/format';
import { marginBadgeTone } from '@/lib/margin-tone';
import { SupplierDrawer } from './supplier-drawer';
import type { SupplierDTO } from '../queries';

export function SupplierTable({
  rows,
  total,
  page,
  perPage,
  marginAlertPercent,
}: {
  rows: SupplierDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
  marginAlertPercent: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [editing, setEditing] = useState<SupplierDTO | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    router.push(`/suppliers?${params.toString()}`);
  }

  const columns: Column<SupplierDTO>[] = [
    {
      header: 'Fornecedor',
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.name}</span>
          <StatusBadge tone={row.isActive ? 'success' : 'neutral'}>
            {row.isActive ? 'Ativo' : 'Inativo'}
          </StatusBadge>
        </div>
      ),
    },
    { header: 'Custo padrão por ciclo', align: 'right', cell: (row) => formatCents(row.unitCostCents) },
    { header: 'Assinaturas ativas', align: 'right', cell: (row) => String(row.activeSubscriptionsCount) },
    {
      header: 'Margem média',
      align: 'right',
      cell: (row) =>
        row.averageMarginPercent === null ? (
          '—'
        ) : (
          <StatusBadge tone={marginBadgeTone(row.averageMarginPercent)}>
            {formatPercent(new Decimal(row.averageMarginPercent), 1)}
          </StatusBadge>
        ),
    },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <IconActionButton
          icon={Pencil}
          label="Editar fornecedor"
          onClick={() => {
            setEditing(row);
            setDrawerOpen(true);
          }}
        />
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
            icon={Truck}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre o fornecedor que fornece os créditos revendidos."
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
          Mudar o custo padrão não altera assinatura nenhuma sozinho: mostra quantas caem abaixo do limite de
          margem e oferece reajuste em lote, válido da próxima cobrança em diante.
        </p>
      )}
      <SupplierDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        supplier={editing}
        marginAlertPercent={marginAlertPercent}
      />
    </>
  );
}
