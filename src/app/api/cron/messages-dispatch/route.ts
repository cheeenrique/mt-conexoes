import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { dispatchPendingMessages } from '@/features/messaging/scheduled-dispatch';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await dispatchPendingMessages(new Date());
  logger.info({ job: 'messages-dispatch', ...result });
  return NextResponse.json(result);
}
