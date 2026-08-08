import { z } from 'zod';

export const dunningStepSchema = z.object({
  offsetDays: z.coerce.number().int('Deslocamento precisa ser um número inteiro.'),
  action: z.enum(['SEND_MESSAGE', 'SUSPEND', 'NOTIFY_OWNER']),
  templateBody: z.string().optional(),
  isActive: z.boolean().default(true),
});

export type DunningStepInput = z.infer<typeof dunningStepSchema>;
