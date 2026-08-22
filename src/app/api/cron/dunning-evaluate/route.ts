import { NextResponse } from 'next/server';
import { assertCloudSchedulerToken } from '@/lib/cron-auth';
import { evaluateDunningRule } from '@/features/dunning/evaluate';
import { getDefaultChannelSummary } from '@/features/messaging/queries';
import { logger } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    await assertCloudSchedulerToken(req);
  } catch {
    return new NextResponse(null, { status: 401 });
  }

  // Composição entre features — `dunning` e `messaging` não se importam entre si
  // (.claude/rules/01-arquitetura.md), então quem resolve a capability do canal
  // padrão e passa pro motor da régua é a rota, igual `page.tsx` já faz na tela.
  const defaultChannel = await getDefaultChannelSummary();
  const result = await evaluateDunningRule(new Date(), defaultChannel?.requiresApprovedTemplate ?? false);
  logger.info({ job: 'dunning-evaluate', ...result });
  return NextResponse.json(result);
}
