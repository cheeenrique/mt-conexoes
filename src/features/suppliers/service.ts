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

export async function applyBulkPriceAdjustment(supplierId: string): Promise<{ count: number }> {
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const subscriptions = await tx.subscription.findMany({ where: { supplierId, status: 'ACTIVE' } });

    for (const sub of subscriptions) {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          costCents: supplier.unitCostCents,
          priceCents: resolveAdjustedPriceCents(sub.priceCents, sub.costCents, supplier.unitCostCents),
        },
      });
    }

    return { count: subscriptions.length };
  });
}
