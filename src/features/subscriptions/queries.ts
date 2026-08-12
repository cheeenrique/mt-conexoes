import Decimal from 'decimal.js';
import { classifySubscriptionMargin } from '@/core/money';
import { db } from '@/lib/db';
import type { BillingCycle, DiscountType, SubscriptionStatus } from '@prisma/client';

export interface SubscriptionDTO {
  id: string;
  customerId: string;
  planId: string | null;
  planName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  priceCents: string;
  costCents: string;
  cycle: BillingCycle;
  nextDueAt: string;
  startedAt: string;
  discountType: DiscountType | null;
  discountValue: string | null;
  discountUntil: string | null;
  status: SubscriptionStatus;
  accessUsername: string | null;
  hasAccessPassword: boolean;
  accessServer: string | null;
  screens: number;
  accessNotes: string | null;
}

function toDTO(row: {
  id: string;
  customerId: string;
  planId: string | null;
  plan: { name: string } | null;
  supplierId: string | null;
  supplier: { name: string } | null;
  priceCents: bigint;
  costCents: bigint;
  cycle: BillingCycle;
  nextDueAt: Date;
  startedAt: Date;
  discountType: DiscountType | null;
  discountValue: unknown;
  discountUntil: Date | null;
  status: SubscriptionStatus;
  accessUsername: string | null;
  accessPasswordEnc: string | null;
  accessServer: string | null;
  screens: number;
  accessNotes: string | null;
}): SubscriptionDTO {
  return {
    id: row.id,
    customerId: row.customerId,
    planId: row.planId,
    planName: row.plan?.name ?? null,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    priceCents: row.priceCents.toString(),
    costCents: row.costCents.toString(),
    cycle: row.cycle,
    nextDueAt: row.nextDueAt.toISOString(),
    startedAt: row.startedAt.toISOString(),
    discountType: row.discountType,
    discountValue: row.discountValue ? String(row.discountValue) : null,
    discountUntil: row.discountUntil ? row.discountUntil.toISOString() : null,
    status: row.status,
    accessUsername: row.accessUsername,
    hasAccessPassword: !!row.accessPasswordEnc,
    accessServer: row.accessServer,
    screens: row.screens,
    accessNotes: row.accessNotes,
  };
}

const INCLUDE = { plan: { select: { name: true } }, supplier: { select: { name: true } } } as const;

export async function listSubscriptionsForCustomer(customerId: string): Promise<SubscriptionDTO[]> {
  const rows = await db.subscription.findMany({
    where: { customerId },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE,
  });
  return rows.map(toDTO);
}

export async function getSubscription(id: string): Promise<SubscriptionDTO | null> {
  const row = await db.subscription.findUnique({ where: { id }, include: INCLUDE });
  return row ? toDTO(row) : null;
}

export type MarginAlertSummary = { negativeCount: number; belowThresholdCount: number };

/** alertPercent entra por parâmetro — esta feature não importa features/settings.
 *  O caller (page.tsx) já busca Settings pra outra coisa e repassa o valor. */
export async function getMarginAlertSummary(alertPercent: Decimal): Promise<MarginAlertSummary> {
  const subscriptions = await db.subscription.findMany({
    where: { status: 'ACTIVE' },
    select: { priceCents: true, costCents: true },
  });

  const statuses = subscriptions.map((s) => classifySubscriptionMargin(s.priceCents, s.costCents, alertPercent));

  return {
    negativeCount: statuses.filter((s) => s === 'negative').length,
    belowThresholdCount: statuses.filter((s) => s === 'below_threshold').length,
  };
}
