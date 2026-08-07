import { db } from '@/lib/db';

export interface SettingsDTO {
  businessName: string;
  timezone: string;
  quietHourStart: number;
  quietHourEnd: number;
  pixKey: string | null;
  pixHolderName: string | null;
  marginAlertPercent: string;
}

export async function getSettings(): Promise<SettingsDTO> {
  const row = await db.settings.findUniqueOrThrow({ where: { id: 'singleton' } });
  return {
    businessName: row.businessName,
    timezone: row.timezone,
    quietHourStart: row.quietHourStart,
    quietHourEnd: row.quietHourEnd,
    pixKey: row.pixKey,
    pixHolderName: row.pixHolderName,
    marginAlertPercent: row.marginAlertPercent.toString(),
  };
}
