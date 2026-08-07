// Labels pt-BR para enums do Prisma exibidos na tela. Promovido para `lib/`
// porque o mapeamento de ciclo já tinha 2 consumidores em `features/plans`
// e ganhou um 3º em `features/subscriptions` — regra de reuso do projeto
// (05-reuso.md) manda extrair na 3ª ocorrência. `lib/` é o destino correto
// porque isso é apresentação, sem regra de negócio.

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
