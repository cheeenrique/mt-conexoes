'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Truck } from 'lucide-react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { formatCents } from '@/lib/format';
import { SupplierDrawer } from './supplier-drawer';
import type { SupplierDTO } from '../queries';

export function SupplierTable({
  rows,
  total,
  page,
  perPage,
}: {
  rows: SupplierDTO[];
  total: number;
  page: number;
  perPage: 8 | 12 | 20;
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
    { header: 'Fornecedor', cell: (row) => row.name },
    { header: 'Custo padrão por ciclo', align: 'right', cell: (row) => formatCents(row.unitCostCents) },
    { header: 'Assinaturas ativas', align: 'right', cell: () => '0' },
    { header: 'Margem média', align: 'right', cell: () => '—' },
    {
      header: '',
      align: 'right',
      cell: (row) => (
        <button
          type="button"
          aria-label="Editar fornecedor"
          title="Editar fornecedor"
          onClick={() => {
            setEditing(row);
            setDrawerOpen(true);
          }}
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
            icon={Truck}
            title="Nenhum fornecedor cadastrado"
            description="Cadastre o fornecedor que fornece os créditos revendidos."
            action={
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
                Cadastrar o primeiro
              </Button>
            }
          />
        }
      />
      <SupplierDrawer open={drawerOpen} onOpenChange={setDrawerOpen} supplier={editing} />
    </>
  );
}
