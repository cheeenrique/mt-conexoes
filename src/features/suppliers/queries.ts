import type Decimal from 'decimal.js';
import { db } from '@/lib/db';
import { resolveAdjustedPriceCents, marginPercent, classifySubscriptionMargin } from '@/core/money';
import type { PerPage } from '@/components/ui/data-table-paging';

export interface SupplierDTO {
  id: string;
  name: string;
  unitCostCents: string;
  notes: string | null;
  isActive: boolean;
  activeSubscriptionsCount: number;
  averageMarginPercent: string | null;
}

type SupplierAggregate = { count: number; sumPriceCents: bigint; sumCostCents: bigint };

function toDTO(
  row: { id: string; name: string; unitCostCents: bigint; notes: string | null; isActive: boolean },
  aggregate: SupplierAggregate | undefined,
): SupplierDTO {
  const count = aggregate?.count ?? 0;
  const averageMargin = aggregate ? marginPercent(aggregate.sumPriceCents, aggregate.sumCostCents) : null;
  return {
    id: row.id,
    name: row.name,
    unitCostCents: row.unitCostCents.toString(),
    notes: row.notes,
    isActive: row.isActive,
    activeSubscriptionsCount: count,
    averageMarginPercent: averageMargin ? averageMargin.toString() : null,
  };
}

/** Uma aggregate query para todos os fornecedores da página — nunca await dentro de map/for. */
async function aggregateActiveSubscriptionsBySupplier(supplierIds: string[]): Promise<Map<string, SupplierAggregate>> {
  if (supplierIds.length === 0) return new Map();

  const groups = await db.subscription.groupBy({
    by: ['supplierId'],
    where: { supplierId: { in: supplierIds }, status: 'ACTIVE' },
    _count: { _all: true },
    _sum: { priceCents: true, costCents: true },
  });

  return new Map(
    groups
      .filter((g): g is typeof g & { supplierId: string } => g.supplierId !== null)
      .map((g) => [
        g.supplierId,
        { count: g._count._all, sumPriceCents: g._sum.priceCents ?? 0n, sumCostCents: g._sum.costCents ?? 0n },
      ]),
  );
}

export async function listSuppliers(params: {
  page: number;
  perPage: PerPage;
}): Promise<{ rows: SupplierDTO[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.supplier.findMany({
      orderBy: { name: 'asc' },
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
    }),
    db.supplier.count(),
  ]);

  const aggregates = await aggregateActiveSubscriptionsBySupplier(rows.map((r) => r.id));
  return { rows: rows.map((row) => toDTO(row, aggregates.get(row.id))), total };
}

export async function getSupplier(id: string): Promise<SupplierDTO | null> {
  const row = await db.supplier.findUnique({ where: { id } });
  if (!row) return null;
  const aggregates = await aggregateActiveSubscriptionsBySupplier([id]);
  return toDTO(row, aggregates.get(id));
}

export async function listActiveSuppliersForSelect(): Promise<{ id: string; name: string }[]> {
  return db.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export type BulkAdjustPreviewRow = {
  subscriptionId: string;
  customerName: string;
  oldPriceCents: string;
  newPriceCents: string;
  oldMarginPercent: string | null;
  newMarginPercent: string | null;
};

/** Só as assinaturas cuja margem, já com o novo custo do fornecedor, cai abaixo de marginAlertPercent. */
export async function listBulkAdjustPreview(
  supplierId: string,
  marginAlertPercent: Decimal,
): Promise<BulkAdjustPreviewRow[]> {
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });
  const subscriptions = await db.subscription.findMany({
    where: { supplierId, status: 'ACTIVE' },
    select: { id: true, priceCents: true, costCents: true, customer: { select: { name: true } } },
  });

  return subscriptions
    .map((sub) => {
      const newPriceCents = resolveAdjustedPriceCents(sub.priceCents, sub.costCents, supplier.unitCostCents);
      const newStatus = classifySubscriptionMargin(newPriceCents, supplier.unitCostCents, marginAlertPercent);
      const row: BulkAdjustPreviewRow = {
        subscriptionId: sub.id,
        customerName: sub.customer.name,
        oldPriceCents: sub.priceCents.toString(),
        newPriceCents: newPriceCents.toString(),
        oldMarginPercent: marginPercent(sub.priceCents, sub.costCents)?.toString() ?? null,
        newMarginPercent: marginPercent(newPriceCents, supplier.unitCostCents)?.toString() ?? null,
      };
      return { row, newStatus };
    })
    .filter(({ newStatus }) => newStatus !== 'ok')
    .map(({ row }) => row);
}
