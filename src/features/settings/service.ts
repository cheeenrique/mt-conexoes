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
