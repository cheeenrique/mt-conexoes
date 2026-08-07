import { db } from '@/lib/db';

export interface SupplierDTO {
  id: string;
  name: string;
  unitCostCents: string;
  notes: string | null;
  isActive: boolean;
}

function toDTO(row: {
  id: string;
  name: string;
  unitCostCents: bigint;
  notes: string | null;
  isActive: boolean;
}): SupplierDTO {
  return { ...row, unitCostCents: row.unitCostCents.toString() };
}

export async function listSuppliers(params: {
  page: number;
  perPage: 8 | 12 | 20;
}): Promise<{ rows: SupplierDTO[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    db.supplier.count(),
  ]);
  return { rows: rows.map(toDTO), total };
}

export async function getSupplier(id: string): Promise<SupplierDTO | null> {
  const row = await db.supplier.findUnique({ where: { id } });
  return row ? toDTO(row) : null;
}

export async function listActiveSuppliersForSelect(): Promise<{ id: string; name: string }[]> {
  return db.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
