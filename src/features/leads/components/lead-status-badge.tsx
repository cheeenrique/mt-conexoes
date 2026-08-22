import type { LeadStatus } from '@prisma/client';
import { StatusBadge } from '@/components/ui/status-badge';

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  CONVERTED: 'Convertido',
  DISCARDED: 'Descartado',
};

const TONES = {
  NEW: 'brand',
  CONTACTED: 'warning',
  CONVERTED: 'success',
  DISCARDED: 'neutral',
} as const;

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <StatusBadge tone={TONES[status]}>{LEAD_STATUS_LABELS[status]}</StatusBadge>;
}
