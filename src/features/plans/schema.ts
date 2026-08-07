import { z } from 'zod';

export const CYCLE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
] as const;

export const planSchema = z.object({
  name: z.string().min(1, 'Informe o nome do plano.'),
  priceCents: z.string().regex(/^\d+$/, 'Preço inválido.'),
  costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
  supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});
