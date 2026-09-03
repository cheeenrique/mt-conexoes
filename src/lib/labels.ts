// Labels pt-BR para enums do Prisma exibidos na tela. Promovido para `lib/`
// porque o mapeamento de ciclo já tinha 2 consumidores em `features/plans`
// e ganhou um 3º em `features/subscriptions` — regra de reuso do projeto
// (05-reuso.md) manda extrair na 3ª ocorrência. `lib/` é o destino correto
// porque isso é apresentação, sem regra de negócio.

import type { CustomerSituation } from '@/core/customer-situation';
import type { DueDateBucket } from '@/core/due-date-buckets';

export const CYCLE_OPTIONS = [
  { value: 'MONTHLY', label: 'Mensal' },
  { value: 'QUARTERLY', label: 'Trimestral' },
  { value: 'SEMIANNUAL', label: 'Semestral' },
  { value: 'ANNUAL', label: 'Anual' },
] as const;

export const CYCLE_LABELS: Record<string, string> = Object.fromEntries(
  CYCLE_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  CANCELLED: 'Cancelada',
};

export const CHARGE_STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Aberta' },
  { value: 'OVERDUE', label: 'Vencida' },
  { value: 'PARTIALLY_PAID', label: 'Parcial' },
  { value: 'PAID', label: 'Paga' },
  { value: 'CANCELLED', label: 'Cancelada' },
] as const;

export const CHARGE_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  CHARGE_STATUS_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const DUNNING_ACTION_OPTIONS = [
  { value: 'SEND_MESSAGE', label: 'Enviar mensagem' },
  { value: 'SUSPEND', label: 'Suspender assinatura' },
  { value: 'NOTIFY_OWNER', label: 'Notificar operador' },
] as const;

export const DUNNING_ACTION_LABELS: Record<string, string> = Object.fromEntries(
  DUNNING_ACTION_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const DUNNING_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  REVIEW: 'Em revisão',
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
};

export const DUE_DATE_BUCKET_LABELS: Record<DueDateBucket, string> = {
  'D-5': 'D-5',
  'D-2': 'D-2',
  'D0': 'HOJE',
  'D+1': 'D+1',
  'D+3': 'D+3',
  'D+5': 'D+5+',
};

export const PAYMENT_METHOD_OPTIONS = [
  { value: 'PIX', label: 'Pix' },
  { value: 'CASH', label: 'Dinheiro' },
  { value: 'TRANSFER', label: 'Transferência' },
  { value: 'CARD', label: 'Cartão' },
  { value: 'OTHER', label: 'Outro' },
] as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((opt) => [opt.value, opt.label]),
);

export const CUSTOMER_SITUATION_LABELS: Record<CustomerSituation, string> = {
  ACTIVE: 'Ativo',
  DUE_TODAY: 'Vence hoje',
  OVERDUE: 'Em atraso',
  OPEN: 'Em aberto',
  SUSPENDED: 'Suspenso',
  NO_SUBSCRIPTION: 'Sem assinatura',
  ANONYMIZED: 'Anonimizado',
};

/** Cores do handoff: verde ativo, âmbar vence hoje, laranja atraso, contorno o resto. */
export const CUSTOMER_SITUATION_TONES: Record<CustomerSituation, 'success' | 'warning' | 'brand' | 'neutral'> = {
  ACTIVE: 'success',
  DUE_TODAY: 'warning',
  OVERDUE: 'brand',
  OPEN: 'neutral',
  SUSPENDED: 'neutral',
  NO_SUBSCRIPTION: 'neutral',
  ANONYMIZED: 'neutral',
};
