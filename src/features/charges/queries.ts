import { db } from '@/lib/db';
import { monthBoundsUtc } from '@/core/dates';
import { resolveDueDateBucket, DUE_DATE_BUCKETS, type DueDateBucket } from '@/core/due-date-buckets';
import { DUE_DATE_BUCKET_LABELS } from '@/lib/labels';

export interface PaymentDTO {
  id: string;
  amountCents: string;
  method: string;
  paidAt: string;
  note: string | null;
}

export interface ChargeDTO {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  supplierName: string | null;
  principalCents: string;
  discountCents: string;
  netCents: string;
  paidCents: string;
  status: string;
  dueAt: string;
  issuedAt: string;
  payments: PaymentDTO[];
}

function toChargeDTO(row: {
  id: string; customerId: string; principalCents: bigint; discountCents: bigint;
  status: string; dueAt: Date; issuedAt: Date;
  customer: { name: string; phone: string | null }; supplier: { name: string } | null;
  payments: { id: string; amountCents: bigint; method: string; paidAt: Date; note: string | null }[];
}): ChargeDTO {
  const netCents = row.principalCents - row.discountCents;
  const paidCents = row.payments.reduce((sum, p) => sum + p.amountCents, 0n);
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customer.name,
    customerPhone: row.customer.phone,
    supplierName: row.supplier?.name ?? null,
    principalCents: row.principalCents.toString(),
    discountCents: row.discountCents.toString(),
    netCents: netCents.toString(),
    paidCents: paidCents.toString(),
    status: row.status,
    dueAt: row.dueAt.toISOString(),
    issuedAt: row.issuedAt.toISOString(),
    payments: row.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents.toString(),
      method: p.method,
      paidAt: p.paidAt.toISOString(),
      note: p.note,
    })),
  };
}

const CHARGE_INCLUDE = {
  customer: { select: { name: true, phone: true } },
  supplier: { select: { name: true } },
  payments: { select: { id: true, amountCents: true, method: true, paidAt: true, note: true } },
} as const;

export async function listCharges(filters: {
  status?: string; customerId?: string; supplierId?: string; cursor?: string; perPage?: number;
  dueFrom?: Date; dueTo?: Date;
}): Promise<{ rows: ChargeDTO[]; nextCursor: string | null }> {
  const perPage = filters.perPage ?? 20;
  const rows = await db.charge.findMany({
    where: {
      status: filters.status ? (filters.status as never) : undefined,
      customerId: filters.customerId || undefined,
      supplierId: filters.supplierId || undefined,
      dueAt:
        filters.dueFrom || filters.dueTo
          ? { gte: filters.dueFrom, lte: filters.dueTo }
          : undefined,
    },
    include: CHARGE_INCLUDE,
    orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
    take: perPage + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > perPage;
  const page = hasMore ? rows.slice(0, perPage) : rows;
  return { rows: page.map(toChargeDTO), nextCursor: hasMore ? page[page.length - 1].id : null };
}

export async function getChargesForCustomer(customerId: string): Promise<ChargeDTO[]> {
  const rows = await db.charge.findMany({
    where: { customerId },
    include: CHARGE_INCLUDE,
    orderBy: { dueAt: 'desc' },
  });
  return rows.map(toChargeDTO);
}

export type DueDateOverview = {
  buckets: { key: DueDateBucket; label: string; count: number; amountCents: string }[];
  charges: (ChargeDTO & { bucket: DueDateBucket })[];
  receivedThisMonthCents: string;
};

export async function getDueDateOverview(now: Date, timezone: string): Promise<DueDateOverview> {
  const [rows, monthPayments] = await Promise.all([
    db.charge.findMany({
      where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
      include: CHARGE_INCLUDE,
      orderBy: { dueAt: 'asc' },
    }),
    (() => {
      const { from, to } = monthBoundsUtc(now.getUTCFullYear(), now.getUTCMonth(), timezone);
      return db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } });
    })(),
  ]);

  const charges = rows.map((r) => ({
    ...toChargeDTO(r),
    bucket: resolveDueDateBucket(r.dueAt, now, timezone),
  }));

  const buckets = DUE_DATE_BUCKETS.map((key) => {
    const inBucket = charges.filter((c) => c.bucket === key);
    const amountCents = inBucket.reduce((sum, c) => sum + (BigInt(c.netCents) - BigInt(c.paidCents)), 0n);
    return { key, label: DUE_DATE_BUCKET_LABELS[key], count: inBucket.length, amountCents: amountCents.toString() };
  });

  return { buckets, charges, receivedThisMonthCents: (monthPayments._sum.amountCents ?? 0n).toString() };
}
