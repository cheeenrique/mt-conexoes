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
      -- Sem filtro de status: cobrança com pagamento registrado nunca é cancelada (regra dura do domínio),
      -- então incluir CANCELLED aqui não muda o resultado — mas deixamos explícito pra não parecer omissão.
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

export interface MonthlySummaryDTO {
  billedCents: string;
  costCents: string;
  receivedCents: string;
  openCents: string;
  costAtRiskCents: string;
}

export interface BreakdownRowDTO {
  id: string;
  name: string;
  billedCents: string;
  costCents: string;
}

type SummaryRow = { billedCents: string; costCents: string; openCents: string; costAtRiskCents: string };

export async function getMonthlySummary(from: Date, to: Date): Promise<MonthlySummaryDTO> {
  const [summaryRows, receivedAgg] = await Promise.all([
    db.$queryRaw<SummaryRow[]>`
      SELECT
        COALESCE(SUM("principalCents" - "discountCents"), 0)::text AS "billedCents",
        COALESCE(SUM("costCents"), 0)::text                        AS "costCents",
        COALESCE(SUM("principalCents" - "discountCents")
                 FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "openCents",
        COALESCE(SUM("costCents")
                 FILTER (WHERE status IN ('OPEN', 'OVERDUE', 'PARTIALLY_PAID')), 0)::text AS "costAtRiskCents"
      FROM charges
      WHERE "dueAt" >= ${from} AND "dueAt" < ${to}
        AND status <> 'CANCELLED'
    `,
    db.payment.aggregate({ where: { paidAt: { gte: from, lt: to } }, _sum: { amountCents: true } }),
  ]);

  const s = summaryRows[0];
  return {
    billedCents: s.billedCents,
    costCents: s.costCents,
    openCents: s.openCents,
    costAtRiskCents: s.costAtRiskCents,
    receivedCents: (receivedAgg._sum.amountCents ?? 0n).toString(),
  };
}

export async function getSupplierBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]> {
  return db.$queryRaw<BreakdownRowDTO[]>`
    SELECT
      s.id AS "id", s.name AS "name",
      COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
      COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
    FROM charges ch
    JOIN suppliers s ON s.id = ch."supplierId"
    WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
      AND ch.status <> 'CANCELLED'
    GROUP BY s.id, s.name
    ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC
  `;
}

export async function getPlanBreakdown(from: Date, to: Date): Promise<BreakdownRowDTO[]> {
  return db.$queryRaw<BreakdownRowDTO[]>`
    SELECT
      p.id AS "id", p.name AS "name",
      COALESCE(SUM(ch."principalCents" - ch."discountCents"), 0)::text AS "billedCents",
      COALESCE(SUM(ch."costCents"), 0)::text                            AS "costCents"
    FROM charges ch
    JOIN subscriptions sub ON sub.id = ch."subscriptionId"
    JOIN plans p ON p.id = sub."planId"
    WHERE ch."dueAt" >= ${from} AND ch."dueAt" < ${to}
      AND ch.status <> 'CANCELLED'
    GROUP BY p.id, p.name
    ORDER BY (SUM(ch."principalCents" - ch."discountCents") - SUM(ch."costCents")) DESC
  `;
}
