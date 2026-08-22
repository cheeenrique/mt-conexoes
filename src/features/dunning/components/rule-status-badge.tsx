import { StatusBadge } from '@/components/ui/status-badge';
import { DUNNING_STATUS_LABELS } from '@/lib/labels';

/**
 * Pausada é laranja, e não amarela como "em revisão": são dois estados com
 * efeitos opostos no motor — uma calcula e não envia, a outra nem roda — e o
 * operador lê a cor antes de ler a palavra.
 */
const TONE: Record<string, 'neutral' | 'warning' | 'success' | 'brand'> = {
  DRAFT: 'neutral',
  REVIEW: 'warning',
  ACTIVE: 'success',
  PAUSED: 'brand',
};

export function RuleStatusBadge({ status }: { status: string }) {
  return <StatusBadge tone={TONE[status] ?? 'neutral'}>{DUNNING_STATUS_LABELS[status] ?? status}</StatusBadge>;
}
