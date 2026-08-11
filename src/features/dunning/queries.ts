import { db } from '@/lib/db';

export interface DunningStepDTO {
  id: string;
  offsetDays: number;
  action: string;
  templateBody: string | null;
  isActive: boolean;
}

export interface DunningRuleDTO {
  id: string;
  name: string;
  status: string;
  isDefault: boolean;
}

export async function getDefaultRuleWithSteps(): Promise<DunningRuleDTO & { steps: DunningStepDTO[] }> {
  const rule = await db.dunningRule.findFirstOrThrow({
    where: { isDefault: true },
    include: { steps: { orderBy: { offsetDays: 'asc' } } },
  });
  return {
    id: rule.id,
    name: rule.name,
    status: rule.status,
    isDefault: rule.isDefault,
    steps: rule.steps.map((s) => ({
      id: s.id,
      offsetDays: s.offsetDays,
      action: s.action,
      templateBody: s.templateBody,
      isActive: s.isActive,
    })),
  };
}

export interface PreviewChargeDTO {
  id: string;
  customerName: string;
  netCents: string;
  dueAt: string;
}

export async function listRecentChargesForPreview(limit = 10): Promise<PreviewChargeDTO[]> {
  const rows = await db.charge.findMany({
    take: limit,
    orderBy: { issuedAt: 'desc' },
    include: { customer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    customerName: row.customer.name,
    netCents: (row.principalCents - row.discountCents).toString(),
    dueAt: row.dueAt.toISOString(),
  }));
}

export interface ReviewPreviewDTO {
  stepId: string;
  offsetDays: number;
  action: string;
  count: number;
}

export async function listReviewPreview(): Promise<ReviewPreviewDTO[]> {
  const rule = await db.dunningRule.findFirstOrThrow({ where: { isDefault: true }, include: { steps: true } });
  const counts = await db.dunningExecution.groupBy({
    by: ['stepId'],
    where: { stepId: { in: rule.steps.map((s) => s.id) }, outcome: 'PENDING_REVIEW' },
    _count: { stepId: true },
  });
  const countByStep = new Map(counts.map((c) => [c.stepId, c._count.stepId]));
  return rule.steps
    .map((step) => ({ stepId: step.id, offsetDays: step.offsetDays, action: step.action, count: countByStep.get(step.id) ?? 0 }))
    .filter((entry) => entry.count > 0);
}

export interface OperatorAlertDTO {
  id: string;
  kind: 'suspended' | 'notify';
  customerName: string;
  at: string;
}

export async function listOperatorAlerts(sinceHours = 24): Promise<OperatorAlertDTO[]> {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const suspended = await db.subscription.findMany({
    where: { status: 'SUSPENDED', updatedAt: { gte: since } },
    include: { customer: { select: { name: true } } },
  });
  const notifyExecutions = await db.dunningExecution.findMany({
    where: { createdAt: { gte: since }, step: { action: 'NOTIFY_OWNER' } },
    include: { charge: { include: { customer: { select: { name: true } } } } },
  });

  return [
    ...suspended.map((s) => ({ id: s.id, kind: 'suspended' as const, customerName: s.customer.name, at: s.updatedAt.toISOString() })),
    ...notifyExecutions.map((e) => ({ id: e.id, kind: 'notify' as const, customerName: e.charge.customer.name, at: e.createdAt.toISOString() })),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
