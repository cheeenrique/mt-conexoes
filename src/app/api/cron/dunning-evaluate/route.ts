import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { evaluateDunningRule } from '@/features/dunning/evaluate';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  const result = await evaluateDunningRule(new Date());
  logger.info({ job: 'dunning-evaluate', ...result });
  return NextResponse.json(result);
}
