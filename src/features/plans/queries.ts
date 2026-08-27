import { db } from '@/lib/db';
import type { BillingCycle } from '@prisma/client';
import type { PerPage } from '@/components/ui/data-table-paging';

export interface PlanDTO {
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  supplierId: string | null;
  supplierName: string | null;
  isActive: boolean;
  activeSubscriptionsCount: number;
}

function toDTO(
  row: {
    id: string;
    name: string;
    priceCents: bigint;
    costCents: bigint;
    cycle: BillingCycle;
    supplierId: string | null;
    isActive: boolean;
    supplier: { name: string } | null;
  },
  activeSubscriptionsCount: number,
): PlanDTO {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    isActive: row.isActive,
    activeSubscriptionsCount,
  };
}

/** Uma aggregate query para todos os planos da página — nunca await dentro de map/for. */
async function countActiveSubscriptionsByPlan(planIds: string[]): Promise<Map<string, number>> {
  if (planIds.length === 0) return new Map();

  const groups = await db.subscription.groupBy({
    by: ['planId'],
    where: { planId: { in: planIds }, status: 'ACTIVE' },
    _count: { _all: true },
  });

  return new Map(
    groups
      .filter((g): g is typeof g & { planId: string } => g.planId !== null)
      .map((g) => [g.planId, g._count._all]),
  );
}

export async function listPlans(params: {
  page: number;
  perPage: PerPage;
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

  const counts = await countActiveSubscriptionsByPlan(rows.map((r) => r.id));
  return { rows: rows.map((row) => toDTO(row, counts.get(row.id) ?? 0)), total };
}

export async function getPlan(id: string): Promise<PlanDTO | null> {
  const row = await db.plan.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
  if (!row) return null;
  const counts = await countActiveSubscriptionsByPlan([id]);
  return toDTO(row, counts.get(id) ?? 0);
}

export async function listActivePlansForSelect(): Promise<{
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  supplierId: string | null;
}[]> {
  const rows = await db.plan.findMany({
    where: { isActive: true },
    select: { id: true, name: true, priceCents: true, costCents: true, cycle: true, supplierId: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    supplierId: row.supplierId,
  }));
}
