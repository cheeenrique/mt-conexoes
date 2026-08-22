import type { ChannelProvider } from '@prisma/client';
import type { ChannelAdapter, ChannelDescriptor } from './types';
import { UnsupportedChannelError } from './types';
import { metaCloudAdapter } from './meta-cloud/adapter';
import { evolutionAdapter } from './evolution/adapter';

/**
 * `SALVY` continua no enum do Postgres — remover valor de enum é migration destrutiva
 * por benefício zero, o valor só fica inalcançável. Ver `prisma/README.md`.
 */
const ADAPTERS: Partial<Record<ChannelProvider, ChannelAdapter>> = {
  META_CLOUD: metaCloudAdapter,
  EVOLUTION: evolutionAdapter,
};

/** Ordem em que os canais aparecem na tela: oficial primeiro. */
export const CHANNEL_PROVIDERS: ChannelProvider[] = ['META_CLOUD', 'EVOLUTION'];

export function resolveAdapter(provider: ChannelProvider): ChannelAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) throw new UnsupportedChannelError(provider);
  return adapter;
}

/**
 * A forma da tela de configuração de um canal. É o que substitui o
 * `if (provider === ...)` que a tela tinha — ver `types.ts`.
 */
export function resolveDescriptor(provider: ChannelProvider): ChannelDescriptor {
  return resolveAdapter(provider).descriptor;
}
