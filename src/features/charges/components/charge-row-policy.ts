import { hasOldPlanAmount } from '@/core/billing';
import type { ChargeDTO } from '../queries';

/** Por que o botão de registrar pagamento está travado — nunca junta os dois
 *  casos numa frase só ("já paga ou cancelada"): o operador quer saber qual. */
export function paymentDisabledReason(status: ChargeDTO['status']): string | undefined {
  if (status === 'PAID') return 'Cobrança já paga';
  if (status === 'CANCELLED') return 'Cobrança cancelada';
  return undefined;
}

/** A baixa só existe onde há saldo pago e saldo devendo — o cliente que pagou
 *  parte e não vai pagar o resto. Fora disso o botão nem aparece: cobrança sem
 *  pagamento se cancela, e cobrança quitada não tem restante. */
export function canWriteOff(charge: ChargeDTO): boolean {
  return isLive(charge) && BigInt(charge.paidCents) > 0n;
}

/** Cobrança que ainda pesa: nem paga, nem cancelada. */
export function isLive(charge: ChargeDTO): boolean {
  return charge.status !== 'PAID' && charge.status !== 'CANCELLED';
}

/** Cancelar é para cobrança que não devia existir. Com dinheiro registrado o
 *  caminho é a baixa do restante — cancelar ali some com o pagamento da conta. */
export function canCancel(charge: ChargeDTO): boolean {
  return isLive(charge) && BigInt(charge.paidCents) === 0n;
}

/** A cobrança carrega o valor congelado na emissão. Divergir do que a assinatura
 *  diz hoje é o sinal de "troquei o plano e a cobrança ficou com o valor velho" —
 *  e é essa cobrança que a régua manda por WhatsApp. */
export function isStaleAmount(charge: ChargeDTO): boolean {
  if (!canCancel(charge)) return false;
  return hasOldPlanAmount({
    chargePrincipalCents: BigInt(charge.principalCents),
    planPriceCents: BigInt(charge.subscriptionPriceCents),
  });
}
