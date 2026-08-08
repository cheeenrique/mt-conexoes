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
