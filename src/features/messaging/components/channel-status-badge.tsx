import { StatusBadge } from '@/components/ui/status-badge';
import type { ChannelConfigDTO } from '../queries';

export function ChannelStatusBadge({ config }: { config: ChannelConfigDTO }) {
  if (!config.configured) return <StatusBadge tone="neutral">Não configurado</StatusBadge>;
  if (config.isActive) return <StatusBadge tone="success">Ativo{config.isDefault ? ' · padrão' : ''}</StatusBadge>;
  if (config.lastCheckOk === false) return <StatusBadge tone="danger">Falha no teste</StatusBadge>;
  return <StatusBadge tone="warning">Configurado, inativo</StatusBadge>;
}
