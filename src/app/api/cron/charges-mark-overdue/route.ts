import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { markOverdueCharges } from '@/features/charges/mark-overdue';
import { logger } from '@/lib/logger';

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
