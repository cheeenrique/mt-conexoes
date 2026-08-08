import type { ChannelProvider } from '@prisma/client';
import type { ChannelAdapter } from './types';
import { metaCloudAdapter } from './meta-cloud/adapter';
import { evolutionAdapter } from './evolution/adapter';
import { salvyAdapter } from './salvy/adapter';

const ADAPTERS: Record<ChannelProvider, ChannelAdapter> = {
  META_CLOUD: metaCloudAdapter,
  EVOLUTION: evolutionAdapter,
  SALVY: salvyAdapter,
};

export function resolveAdapter(provider: ChannelProvider): ChannelAdapter {
  return ADAPTERS[provider];
}
