'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { supplierSchema } from './schema';
import { createSupplier, updateSupplier, applyBulkPriceAdjustment } from './service';
import { listBulkAdjustPreview, type BulkAdjustPreviewRow } from './queries';
import { requireSession } from '@/features/auth/service';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';

type ActionResult = { ok: true } | { error: { code: string; message: string } };
type ActionError = { error: { code: string; message: string } };

const bulkAdjustCentsSchema = z.string().regex(/^\d+$/, 'Custo inválido.');
// Mesmo formato de Settings.marginAlertPercent (features/settings/schema.ts) — não importamos
// a feature settings aqui (uma feature não importa de outra); o valor chega validado por prop,
// vindo de getSettings() na page.
const marginAlertPercentSchema = z.string().regex(/^\d+(\.\d{1,2})?$/, 'Percentual inválido.');

export async function createSupplierAction(input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await createSupplier(parsed.data);
    revalidatePath('/suppliers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.create', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function updateSupplierAction(id: string, input: unknown): Promise<ActionResult> {
  try {
    await requireSession();
    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    await updateSupplier(id, parsed.data);
    revalidatePath('/suppliers');
    return { ok: true as const };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.update', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function getBulkAdjustPreviewAction(
  supplierId: string,
  marginAlertPercent: unknown,
): Promise<{ ok: true; rows: BulkAdjustPreviewRow[] } | ActionError> {
  try {
    await requireSession();
    const parsedAlertPercent = marginAlertPercentSchema.safeParse(marginAlertPercent);
    if (!parsedAlertPercent.success) {
      return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };
    }

    const rows = await listBulkAdjustPreview(supplierId, new Decimal(parsedAlertPercent.data));
    return { ok: true as const, rows };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjustPreview', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}

export async function applyBulkAdjustAction(
  supplierId: string,
  oldUnitCostCents: unknown,
  newUnitCostCents: unknown,
): Promise<{ ok: true; count: number } | ActionError> {
  try {
    await requireSession();
    const parsedOld = bulkAdjustCentsSchema.safeParse(oldUnitCostCents);
    const parsedNew = bulkAdjustCentsSchema.safeParse(newUnitCostCents);
    if (!parsedOld.success || !parsedNew.success) {
      return { error: { code: 'VALIDATION', message: messages.common.invalidInput } };
    }

    const result = await applyBulkPriceAdjustment(supplierId, BigInt(parsedOld.data), BigInt(parsedNew.data));
    revalidatePath('/suppliers');
    return { ok: true as const, count: result.count };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'suppliers.bulkAdjust', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
