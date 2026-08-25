import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkHealth } from './check';

export async function GET() {
  const { status, httpStatus } = await checkHealth(() => db.$queryRaw`SELECT 1`);

  if (httpStatus !== 200) {
    logger.error({ route: 'api/health', status, httpStatus });
  }

  return NextResponse.json({ status }, { status: httpStatus });
}
