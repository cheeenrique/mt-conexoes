import { z } from 'zod';

export const registerPaymentSchema = z.object({
  amountCents: z.string({ error: 'Valor inválido.' }).regex(/^\d+$/, 'Valor inválido.'),
  method: z.enum(['PIX', 'CASH', 'TRANSFER', 'CARD', 'OTHER'], { error: 'Selecione um método válido.' }),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do pagamento inválida.'),
  note: z.string().optional(),
  idempotencyKey: z.string().min(1, 'Identificador de envio ausente.'),
});

export const cancelChargeSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo do cancelamento.'),
});
