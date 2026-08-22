import { StatusBadge } from '@/components/ui/status-badge';
import type { ChannelConfigDTO } from '../queries';

export function ChannelStatusBadge({ config }: { config: ChannelConfigDTO }) {
  if (!config.configured) return <StatusBadge tone="neutral">Não configurado</StatusBadge>;
  // Falha visível em vez de troca automática de canal: quem decide é o operador.
  if (config.lastCheckOk === false) return <StatusBadge tone="danger">Falha no teste</StatusBadge>;
  return <StatusBadge tone="success">Configurado</StatusBadge>;
}
