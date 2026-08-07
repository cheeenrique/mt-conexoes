import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'Informe o nome do fornecedor.'),
  unitCostCents: z.string().regex(/^\d+$/, 'Custo inválido.'),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});
