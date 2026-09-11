import { DomainError } from '@/lib/errors';

/**
 * Erros de domínio da assinatura, num módulo só: `service.ts`, `credentials.ts`
 * e `imported.ts` lançam os mesmos, e deixá-los em `service.ts` obrigaria os
 * outros dois a importar de lá só pela classe de erro.
 */
export class SubscriptionNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND', { cause });
  }
}

export class SubscriptionCancelledError extends DomainError {
  constructor(cause?: unknown) {
    super('Esta assinatura foi cancelada e não volta a ficar ativa por aqui.', 'SUBSCRIPTION_CANCELLED', { cause });
  }
}

export class PlanNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Plano não encontrado.', 'PLAN_NOT_FOUND', { cause });
  }
}
