import { ChannelGrid } from '@/features/messaging/components/channel-grid';
import type { ChannelConfigDTO } from '@/features/messaging/queries';

export function ChannelsTab({ configs, timezone }: { configs: ChannelConfigDTO[]; timezone: string }) {
  return <ChannelGrid configs={configs} timezone={timezone} />;
}
