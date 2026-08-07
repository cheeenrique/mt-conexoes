import { NextResponse } from 'next/server';
import { assertCronRequest } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    assertCronRequest(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  logger.info({ job: 'cron-ping', status: 'ok' });
  return NextResponse.json({ pong: true });
}
