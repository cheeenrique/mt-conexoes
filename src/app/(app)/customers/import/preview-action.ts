'use server';

import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { importCustomersSchema } from '@/features/customers/import/schema';
import { toImportPlanDTO, type PreviewCustomersImportResult } from '@/features/customers/import/types';
import { previewCustomersImportFromUpload } from '../customer-import';

/** Prévia da Etapa 2 — casca: sessão, Zod, service. NUNCA escreve no banco. */
export async function previewCustomersImportAction(formData: FormData): Promise<PreviewCustomersImportResult> {
  try {
    await requireSession();

    const parsed = importCustomersSchema.safeParse({
      supplierId: formData.get('supplierId'),
      file: formData.get('file'),
    });
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    const { fileName, plan } = await previewCustomersImportFromUpload(parsed.data);
    return { ok: true, fileName, plan: toImportPlanDTO(plan) };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.import.preview', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
