import { z } from 'zod';

// Enum com `{ error }` custom perde a mensagem quando fica dentro de um
// `.or(z.literal(''))` — zod cai no "Invalid input" genérico do union nesse
// caso (verificado manualmente contra a zod 4.4 instalada). `preprocess`
// normaliza '' para undefined antes do enum validar, então a mensagem
// customizada sempre aparece.
const discountTypeField = z.preprocess(
  (val) => (val === '' ? undefined : val),
  z.enum(['PERCENT', 'FIXED'], { error: 'Selecione um tipo de desconto válido.' }).optional(),
);

export const subscriptionSchema = z.object({
  planId: z.string().uuid('Plano inválido.').optional().or(z.literal('')),
  supplierId: z.string().uuid('Fornecedor inválido.').optional().or(z.literal('')),
  priceCents: z.string({ error: 'Preço inválido.' }).regex(/^\d+$/, 'Preço inválido.'),
  costCents: z.string({ error: 'Custo inválido.' }).regex(/^\d+$/, 'Custo inválido.'),
  cycle: z.enum(['MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL'], { error: 'Selecione um ciclo válido.' }),
  discountType: discountTypeField,
  discountValue: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor de desconto inválido.').optional().or(z.literal('')),
  discountUntil: z.string().optional(),
  accessUsername: z.string().optional(),
  accessPassword: z.string().optional(),
  accessServer: z.string().optional(),
  screens: z.number({ error: 'Informe o número de telas.' }).int().min(1, 'Mínimo 1 tela.').default(1),
  accessNotes: z.string().optional(),
});
