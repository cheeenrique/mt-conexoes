'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { DomainError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { messages } from '@/lib/messages';
import { importCustomersSchema } from '@/features/customers/import/schema';
import { toImportSummaryDTO, type ImportCustomersResult } from '@/features/customers/import/types';
import { importCustomersFromUpload } from './customer-import';

/** Importação da planilha de clientes pela tela — casca: sessão, Zod, service, revalidate. */
export async function importCustomersAction(formData: FormData): Promise<ImportCustomersResult> {
  try {
    await requireSession();

    const parsed = importCustomersSchema.safeParse({
      supplierId: formData.get('supplierId'),
      file: formData.get('file'),
    });
    if (!parsed.success) {
      return { error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message ?? messages.common.invalidInput } };
    }

    const summary = await importCustomersFromUpload(parsed.data);
    revalidatePath('/customers');
    return { ok: true, summary: toImportSummaryDTO(summary) };
  } catch (err) {
    if (err instanceof DomainError) return { error: { code: err.code, message: err.message } };
    logger.error({ route: 'customers.import', error: String(err), stack: err instanceof Error ? err.stack : undefined });
    return { error: { code: 'UNEXPECTED', message: messages.common.unexpectedError } };
  }
}
