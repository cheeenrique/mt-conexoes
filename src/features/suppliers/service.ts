import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { resolveAdjustedPriceCents } from '@/core/money';
import type { z } from 'zod';
import type { supplierSchema } from './schema';

type SupplierInput = z.infer<typeof supplierSchema>;

export class SupplierNameTakenError extends DomainError {
  constructor(cause?: unknown) {
    super('Já existe um fornecedor com esse nome.', 'SUPPLIER_NAME_TAKEN', { cause });
  }
}

export class BulkAdjustStaleError extends DomainError {
  constructor(cause?: unknown) {
    super('O custo do fornecedor mudou desde a última revisão. Feche e abra o reajuste de novo.', 'BULK_ADJUST_STALE', { cause });
  }
}

export async function createSupplier(input: SupplierInput) {
  try {
    return await db.supplier.create({
      data: {
        name: input.name,
        unitCostCents: BigInt(input.unitCostCents),
        notes: input.notes || null,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SupplierNameTakenError(err);
    throw err;
  }
}

export async function updateSupplier(id: string, input: SupplierInput) {
  try {
    return await db.supplier.update({
      where: { id },
      data: {
        name: input.name,
        unitCostCents: BigInt(input.unitCostCents),
        notes: input.notes || null,
        isActive: input.isActive,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new SupplierNameTakenError(err);
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 'P2002';
}

const BULK_ADJUST_CHUNK_SIZE = 500;

export async function applyBulkPriceAdjustment(
  supplierId: string,
  expectedOldUnitCostCents: bigint,
  expectedNewUnitCostCents: bigint,
): Promise<{ count: number }> {
  const supplier = await db.supplier.findUniqueOrThrow({ where: { id: supplierId } });

  if (expectedNewUnitCostCents <= expectedOldUnitCostCents || supplier.unitCostCents !== expectedNewUnitCostCents) {
    throw new BulkAdjustStaleError();
  }

  const subscriptions = await db.subscription.findMany({
    where: { supplierId, status: 'ACTIVE' },
    select: { id: true, priceCents: true, costCents: true },
  });

  for (let i = 0; i < subscriptions.length; i += BULK_ADJUST_CHUNK_SIZE) {
    const chunk = subscriptions.slice(i, i + BULK_ADJUST_CHUNK_SIZE);
    await db.$transaction(async (tx) => {
      for (const sub of chunk) {
        await tx.subscription.update({
          where: { id: sub.id },
          data: {
            costCents: supplier.unitCostCents,
            priceCents: resolveAdjustedPriceCents(sub.priceCents, sub.costCents, supplier.unitCostCents),
          },
        });
      }
    });
  }

  return { count: subscriptions.length };
}
