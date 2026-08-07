import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import type { z } from 'zod';
import type { planSchema } from './schema';

type PlanInput = z.infer<typeof planSchema>;

export class PlanNameTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um plano com esse nome.', 'PLAN_NAME_TAKEN', { cause });
  }
}

function toData(input: PlanInput) {
  return {
    name: input.name,
    priceCents: BigInt(input.priceCents),
    costCents: BigInt(input.costCents),
    cycle: input.cycle,
    supplierId: input.supplierId || null,
    isActive: input.isActive,
  };
}

export async function createPlan(input: PlanInput) {
  try {
    return await db.plan.create({ data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PlanNameTakenError(err);
    throw err;
  }
}

export async function updatePlan(id: string, input: PlanInput) {
  try {
    return await db.plan.update({ where: { id }, data: toData(input) });
  } catch (err) {
    if (isUniqueViolation(err)) throw new PlanNameTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}
