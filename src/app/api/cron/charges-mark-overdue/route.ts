import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { db } from '@/lib/db';
import { deriveChargeStatus } from '@/core/billing';
import { logger } from '@/lib/logger';

export async function markOverdueCharges(now: Date): Promise<{ checked: number; updated: number; failed: number }> {
  const charges = await db.charge.findMany({
    where: { status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } },
    include: { payments: { select: { amountCents: true } } },
  });

  let updated = 0;
  let failed = 0;

  for (const charge of charges) {
    try {
      const netCents = charge.principalCents - charge.discountCents;
      const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
      const newStatus = deriveChargeStatus({ netCents, paidCents, dueAt: charge.dueAt, now });

      if (newStatus !== charge.status) {
        await db.charge.update({ where: { id: charge.id }, data: { status: newStatus } });
        updated++;
      }
    } catch (err) {
      failed++;
      logger.error({ job: 'charges-mark-overdue', chargeId: charge.id, error: String(err) });
    }
  }

  return { checked: charges.length, updated, failed };
}

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await markOverdueCharges(new Date());
  logger.info({ job: 'charges-mark-overdue', ...result });
  return NextResponse.json(result);
}
