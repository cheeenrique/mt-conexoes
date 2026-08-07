import { z } from 'zod';

export const settingsSchema = z
  .object({
    businessName: z.string().min(1, 'Informe o nome do negócio.'),
    timezone: z.string().min(1, 'Selecione um fuso horário.'),
    quietHourStart: z
      .number({ error: 'Informe um horário válido.' })
      .int()
      .min(0, 'Hora inválida.')
      .max(23, 'Hora inválida.'),
    quietHourEnd: z.number().int().min(0).max(23),
    pixKey: z.string().optional(),
    pixHolderName: z.string().optional(),
    marginAlertPercent: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Percentual inválido.'),
  })
  .refine((data) => data.quietHourStart < data.quietHourEnd, {
    message: 'O início precisa ser antes do fim.',
    path: ['quietHourEnd'],
  });
