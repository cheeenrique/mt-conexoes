import { z } from 'zod';
import { isValidCalendarDate } from '@/core/dates';

export const registerPaymentSchema = z.object({
  amountCents: z
    .string({ error: 'Valor inválido.' })
    .regex(/^\d+$/, 'Valor inválido.')
    .refine((v) => BigInt(v) > 0n, 'Valor deve ser maior que zero.'),
  method: z.enum(['PIX', 'CASH', 'TRANSFER', 'CARD', 'OTHER'], { error: 'Selecione um método válido.' }),
  paidAt: z
    .string({ error: 'Data do pagamento inválida.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do pagamento inválida.')
    .refine(isValidCalendarDate, 'Data do pagamento inválida.'),
  // Vencimento do ciclo seguinte. Ausente = o service aplica a regra
  // (`nextDueDate`: a mais tarde entre o vencimento em aberto e o pagamento).
  // Preenchido = o operador combinou outra data com o cliente e ela manda.
  nextDueAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data do próximo vencimento inválida.')
    .refine(isValidCalendarDate, 'Data do próximo vencimento inválida.')
    .optional()
    .or(z.literal('')),
  note: z.string().optional(),
  idempotencyKey: z.string().min(1, 'Identificador de envio ausente.'),
});

export const cancelChargeSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo do cancelamento.'),
});
