import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { phoneSearchDigits } from '@/core/phone';
import { monthBoundsUtc } from '@/core/dates';
import { computeChargeDiscount } from '@/core/billing';
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
  /** Preço e custo que a assinatura tem **hoje**. A cobrança carrega o que valia
   *  na emissão; divergir dos dois é o sinal de "troquei o plano e a cobrança
   *  ficou com o valor velho", que a tela oferece corrigir. */
  subscriptionPriceCents: string;
  subscriptionCostCents: string;
  /** Quanto a cobrança passa a valer se for realinhada ao plano: preço de hoje
   *  menos o desconto vigente no período, pela mesma conta do realinhamento. */
  subscriptionNetCents: string;
  /** Ciclo da assinatura — a prévia do próximo vencimento no diálogo de pagamento. */
  subscriptionCycle: string;
  payments: PaymentDTO[];
}

function toChargeDTO(row: {
  id: string; customerId: string; principalCents: bigint; discountCents: bigint; costCents: bigint;
  status: string; dueAt: Date; issuedAt: Date; periodStart: Date;
  customer: { name: string; phone: string | null }; supplier: { name: string } | null;
  subscription: {
    priceCents: bigint; costCents: bigint; cycle: string;
    discountType: string | null; discountValue: unknown; discountUntil: Date | null;
  };
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
    subscriptionPriceCents: row.subscription.priceCents.toString(),
    subscriptionCostCents: row.subscription.costCents.toString(),
    subscriptionNetCents: (row.subscription.priceCents - computeChargeDiscount(row.subscription, row.periodStart)).toString(),
    subscriptionCycle: row.subscription.cycle,
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
  subscription: {
    select: { priceCents: true, costCents: true, cycle: true, discountType: true, discountValue: true, discountUntil: true },
  },
  payments: { select: { id: true, amountCents: true, method: true, paidAt: true, note: true } },
} as const;

/** Busca livre da lista: nome do cliente ou telefone. O telefone é guardado em
 *  E.164 (`+5562998133401`), então o termo com máscara vira dígitos antes. */
function customerSearchWhere(q: string): Prisma.ChargeWhereInput {
  const digits = phoneSearchDigits(q);
  const or: Prisma.CustomerWhereInput[] = [{ name: { contains: q, mode: 'insensitive' } }];
  if (digits) or.push({ phone: { contains: digits } });
  return { customer: { OR: or } };
}

export async function listCharges(filters: {
  q?: string; status?: string; supplierId?: string; dueFrom?: Date; dueTo?: Date;
  page: number; perPage: number;
}): Promise<{ rows: ChargeDTO[]; total: number }> {
  const q = filters.q?.trim();
  const where: Prisma.ChargeWhereInput = {
    ...(q ? customerSearchWhere(q) : {}),
    status: filters.status ? (filters.status as never) : undefined,
    supplierId: filters.supplierId || undefined,
    dueAt:
      filters.dueFrom || filters.dueTo
        ? { gte: filters.dueFrom, lte: filters.dueTo }
        : undefined,
  };

  const [rows, total] = await Promise.all([
    db.charge.findMany({
      where,
      include: CHARGE_INCLUDE,
      orderBy: [{ dueAt: 'desc' }, { id: 'desc' }],
      skip: (filters.page - 1) * filters.perPage,
      take: filters.perPage,
    }),
    db.charge.count({ where }),
  ]);

  return { rows: rows.map(toChargeDTO), total };
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
