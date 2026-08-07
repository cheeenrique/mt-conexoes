import { db } from '@/lib/db';
import type { BillingCycle } from '@prisma/client';

export interface PlanDTO {
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  supplierId: string | null;
  supplierName: string | null;
  isActive: boolean;
}

export async function listPlans(params: {
  page: number;
  perPage: 8 | 12 | 20;
}): Promise<{ rows: PlanDTO[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.plan.findMany({
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      include: { supplier: { select: { name: true } } },
    }),
    db.plan.count(),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      priceCents: row.priceCents.toString(),
      costCents: row.costCents.toString(),
      cycle: row.cycle,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? null,
      isActive: row.isActive,
    })),
    total,
  };
}

export async function getPlan(id: string): Promise<PlanDTO | null> {
  const row = await db.plan.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    isActive: row.isActive,
  };
}
