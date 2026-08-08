import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().min(1, 'Informe o nome do cliente.'),
  phone: z.string().regex(/^\+55\d{10,11}$/, 'Telefone inválido.').optional().or(z.literal('')),
  email: z.string().email('E-mail inválido.').optional().or(z.literal('')),
  document: z.string().optional(),
  notes: z.string().optional(),
});
