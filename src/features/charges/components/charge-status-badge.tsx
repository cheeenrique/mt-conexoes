import { StatusBadge } from '@/components/ui/status-badge';
import { CHARGE_STATUS_LABELS } from '@/lib/labels';
import type { ChargeDTO } from '../queries';

function statusTone(status: ChargeDTO['status']): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'PAID') return 'success';
  if (status === 'PARTIALLY_PAID') return 'warning';
  if (status === 'OVERDUE') return 'danger';
  return 'neutral';
}

export function ChargeStatusBadge({ status }: { status: ChargeDTO['status'] }) {
  return <StatusBadge tone={statusTone(status)}>{CHARGE_STATUS_LABELS[status] ?? status}</StatusBadge>;
}
