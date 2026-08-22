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
    quietHourEnd: z
      .number({ error: 'Informe um horário válido.' })
      .int()
      .min(0, 'Hora inválida.')
      .max(23, 'Hora inválida.'),
    pixKey: z.string().optional(),
    pixHolderName: z.string().optional(),
    marginAlertPercent: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, 'Percentual inválido.')
      .refine((v) => Number(v) <= 100, 'O percentual não pode passar de 100.'),
  })
  .refine((data) => data.quietHourStart < data.quietHourEnd, {
    message: 'O início precisa ser antes do fim.',
    path: ['quietHourEnd'],
  });

export type SettingsFormValues = z.infer<typeof settingsSchema>;

// Kill switch (T8, CLAUDE.md §Régua — travas). Recebe o estado alvo explícito
// em vez de inverter o valor atual no banco: assim um clique perdido em
// trânsito nunca deixa o estado divergente do que o operador viu na tela.
export const toggleSendingPausedSchema = z.object({
  paused: z.boolean(),
});
