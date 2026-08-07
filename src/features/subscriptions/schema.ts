import { z } from 'zod';

export const subscriptionSchema = z.object({
  planId: z.string().uuid('Plano inválido.').optional().or(z.literal('')),
  supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
  priceCents: z.string().regex(/^\d+$/, 'Preço inválido.'),
  costCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
  discountType: z.enum(['PERCENT', 'FIXED']).optional().or(z.literal('')),
  discountValue: z.string().optional(),
  discountUntil: z.string().optional(),
  accessUsername: z.string().optional(),
  accessPassword: z.string().optional(),
  accessServer: z.string().optional(),
  screens: z.number().int().min(1, 'Mínimo 1 tela.').default(1),
  accessNotes: z.string().optional(),
});
