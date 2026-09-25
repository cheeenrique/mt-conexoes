import { DomainError } from '@/lib/errors';

/**
 * Erros de domínio da cobrança, num módulo só: `service.ts` e `realign.ts`
 * lançam os mesmos, e deixá-los em `service.ts` faria os dois se importarem
 * em círculo só pela classe de erro.
 */
export class ChargeNotFoundError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança não encontrada.', 'CHARGE_NOT_FOUND', { cause }); }
}
export class ChargeAlreadyPaidError extends DomainError {
  constructor(cause?: unknown) { super('Esta cobrança já foi paga.', 'CHARGE_ALREADY_PAID', { cause }); }
}
export class PaymentExceedsBalanceError extends DomainError {
  constructor(cause?: unknown) { super('Valor do pagamento é maior que o saldo devedor.', 'PAYMENT_EXCEEDS_BALANCE', { cause }); }
}
export class ChargeHasPaymentError extends DomainError {
  constructor(cause?: unknown) { super('Cobrança com pagamento registrado não pode ser cancelada.', 'CHARGE_HAS_PAYMENT', { cause }); }
}
export class PaymentDateInFutureError extends DomainError {
  constructor(cause?: unknown) { super('A data do pagamento não pode ser no futuro.', 'PAYMENT_DATE_IN_FUTURE', { cause }); }
}
export class ChargeWithoutPaymentError extends DomainError {
  constructor(cause?: unknown) { super('Esta cobrança não tem pagamento registrado — cancele em vez de dar baixa.', 'CHARGE_WITHOUT_PAYMENT', { cause }); }
}
