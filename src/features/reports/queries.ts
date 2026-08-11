import { db } from '@/lib/db';

export interface CustomerPnlDTO {
  billedCents: string;
  receivedCents: string;
  costCents: string;
  chargesCount: number;
  paidCount: number;
  overdueCount: number;
  openCount: number;
}

type BilledRow = {
  billedCents: string;
  costCents: string;
  chargesCount: number;
  paidCount: number;
  overdueCount: number;
  openCount: number;
};

type ReceivedRow = { receivedCents: string };

export async function getCustomerPnl(customerId: string): Promise<CustomerPnlDTO> {
  const [billed, received] = await Promise.all([
    db.$queryRaw<BilledRow[]>`
      SELECT
        COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
        COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
        COUNT(*)::int                                               AS "chargesCount",
        COUNT(*) FILTER (WHERE status = 'PAID')::int                AS "paidCount",
        COUNT(*) FILTER (WHERE status = 'OVERDUE')::int              AS "overdueCount",
        COUNT(*) FILTER (WHERE status IN ('OPEN', 'PARTIALLY_PAID'))::int AS "openCount"
      FROM charges
      WHERE "customerId" = ${customerId}
        AND status <> 'CANCELLED'
    `,
    db.$queryRaw<ReceivedRow[]>`
      SELECT COALESCE(SUM(p."amountCents"), 0)::text AS "receivedCents"
      FROM payments p
      JOIN charges ch ON ch.id = p."chargeId"
      WHERE ch."customerId" = ${customerId}
    `,
  ]);

  const b = billed[0];
  const r = received[0];

  return {
    billedCents: b.billedCents,
    receivedCents: r.receivedCents,
    costCents: b.costCents,
    chargesCount: b.chargesCount,
    paidCount: b.paidCount,
    overdueCount: b.overdueCount,
    openCount: b.openCount,
  };
}
