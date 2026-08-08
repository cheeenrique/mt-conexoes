import { db } from '@/lib/db';
import type { ChannelProvider } from '@prisma/client';

const ALL_PROVIDERS: ChannelProvider[] = ['META_CLOUD', 'EVOLUTION', 'SALVY'];

const PROVIDER_LABELS: Record<ChannelProvider, string> = {
  META_CLOUD: 'Meta Cloud API',
  EVOLUTION: 'Evolution API',
  SALVY: 'Salvy',
};

export type ChannelConfigDTO = {
  provider: ChannelProvider;
  configured: boolean;
  label: string;
  isActive: boolean;
  isDefault: boolean;
  phoneNumber: string | null;
  riskAcceptedAt: string | null;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastError: string | null;
};

export async function listChannelConfigs(): Promise<ChannelConfigDTO[]> {
  const rows = await db.channelConfig.findMany({
    where: { provider: { in: ALL_PROVIDERS } },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return ALL_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (!row) {
      return {
        provider,
        configured: false,
        label: PROVIDER_LABELS[provider],
        isActive: false,
        isDefault: false,
        phoneNumber: null,
        riskAcceptedAt: null,
        lastCheckAt: null,
        lastCheckOk: null,
        lastError: null,
      };
    }
    return {
      provider,
      configured: true,
      label: row.label,
      isActive: row.isActive,
      isDefault: row.isDefault,
      phoneNumber: row.phoneNumber,
      riskAcceptedAt: row.riskAcceptedAt?.toISOString() ?? null,
      lastCheckAt: row.lastCheckAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
      lastError: row.lastError,
    };
  });
}
