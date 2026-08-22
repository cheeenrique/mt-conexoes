import { db } from '@/lib/db';
import type { z } from 'zod';
import type { settingsSchema } from './schema';

type SettingsInput = z.infer<typeof settingsSchema>;

export async function updateSettings(input: SettingsInput) {
  return db.settings.update({
    where: { id: 'singleton' },
    data: {
      businessName: input.businessName,
      timezone: input.timezone,
      quietHourStart: input.quietHourStart,
      quietHourEnd: input.quietHourEnd,
      pixKey: input.pixKey || null,
      pixHolderName: input.pixHolderName || null,
      marginAlertPercent: input.marginAlertPercent,
    },
  });
}

// Kill switch (T8). `dispatchPendingMessages` lê esta coluna a cada passada
// (features/messaging/scheduled-dispatch.ts) — gravar aqui já vale a partir
// do próximo ciclo do cron, sem depender de nenhum cache.
export async function setSendingPaused(paused: boolean) {
  return db.settings.update({
    where: { id: 'singleton' },
    data: { sendingPaused: paused },
  });
}
