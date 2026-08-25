import { z } from 'zod';

/** Planilha de 28 linhas ocupa menos de 50 KB — 5 MB é folgado sem deixar o upload sem teto. */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xlsx', '.xlsm'];

function hasAllowedExtension(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export const importCustomersSchema = z.object({
  supplierId: z.string().min(1, 'Selecione o fornecedor.'),
  file: z
    .instanceof(File, { message: 'Selecione o arquivo da planilha.' })
    .refine((file) => file.size > 0, { message: 'Selecione o arquivo da planilha.' })
    .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, { message: 'Arquivo muito grande. O limite é 5 MB.' })
    .refine((file) => hasAllowedExtension(file.name), { message: 'Envie um arquivo .xlsx ou .xlsm.' }),
});
