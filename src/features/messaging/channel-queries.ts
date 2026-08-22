import { db } from '@/lib/db';
import type { ChannelProvider } from '@prisma/client';
import { CHANNEL_PROVIDERS, resolveAdapter, resolveDescriptor } from './channels/registry';
import type { ChannelDescriptor } from './channels/types';

export type ChannelConfigDTO = {
  provider: ChannelProvider;
  configured: boolean;
  /**
   * A forma da tela deste canal: passos, campos, aviso e rótulo de tipo. Vem do
   * adapter, nunca de um `if (provider === ...)` no componente.
   *
   * ⚠️ Descreve os campos; não carrega valor. Credencial de canal não volta para
   * o front, nem mascarada — por isso não existe `credentials` neste DTO.
   */
  descriptor: ChannelDescriptor;
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
    where: { provider: { in: CHANNEL_PROVIDERS } },
  });
  const byProvider = new Map(rows.map((row) => [row.provider, row]));

  return CHANNEL_PROVIDERS.map((provider) => {
    const row = byProvider.get(provider);
    if (!row) {
      return {
        provider,
        configured: false,
        descriptor: resolveDescriptor(provider),
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
      descriptor: resolveDescriptor(provider),
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

export type ChannelDownAlertDTO = {
  label: string;
  /** Desde quando o `connection.update` reportou `state: 'close'` — `null` quando a
   *  queda foi detectada só pelo healthCheck periódico (VPS inteira fora do ar, sem
   *  emitir webhook nenhum). */
  disconnectedAt: string | null;
};

/**
 * Canal padrão que a régua usaria para enviar agora, mas está marcado como fora do ar
 * (`lastCheckOk === false`) — o mesmo campo que `scheduled-dispatch.ts` confere antes de
 * cada envio. `null` quando não há motivo pra alarme.
 */
export async function getChannelDownAlert(): Promise<ChannelDownAlertDTO | null> {
  const row = await db.channelConfig.findFirst({
    // `provider: { in: ... }` porque o enum do Postgres ainda carrega `SALVY`, sem adapter:
    // linha antiga marcada como padrão não pode derrubar o alerta em `resolveDescriptor`.
    where: { isDefault: true, isActive: true, provider: { in: CHANNEL_PROVIDERS } },
  });
  if (!row || row.lastCheckOk !== false) return null;

  return {
    label: resolveDescriptor(row.provider).label,
    disconnectedAt: row.disconnectedAt?.toISOString() ?? null,
  };
}

export type DefaultChannelSummaryDTO = {
  label: string;
  requiresApprovedTemplate: boolean;
};

/**
 * Canal padrão que a régua usaria pra enviar agora — mesma seleção de
 * `scheduled-dispatch.ts` (`isDefault && isActive`), não "o primeiro canal
 * ativo". Consumido pela tela de réguas (`ChannelNote`) e pelo cron
 * `dunning-evaluate`, pra decidir se um passo sem `metaTemplateName` vira
 * `SKIPPED`: se a leitura divergisse da seleção real do despacho, a régua
 * prometeria (ou pularia) um envio que o despacho faz diferente.
 */
export async function getDefaultChannelSummary(): Promise<DefaultChannelSummaryDTO | null> {
  const row = await db.channelConfig.findFirst({
    where: { isDefault: true, isActive: true, provider: { in: CHANNEL_PROVIDERS } },
  });
  if (!row) return null;

  const adapter = resolveAdapter(row.provider);
  return { label: adapter.descriptor.label, requiresApprovedTemplate: adapter.capabilities.requiresApprovedTemplate };
}
