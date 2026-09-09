import type { Prisma } from '@prisma/client';
import { localDateOnly, periodStartForDue, type BillingCycle } from '@/core/dates';

/**
 * A cobrança em aberto que a assinatura importada precisa ter. Sem ela o
 * cliente fica com assinatura `ACTIVE` e nenhuma cobrança: some de /charges,
 * nunca cai nos chips da escada de vencimento (que filtram por cobrança em
 * aberto), a régua não o avalia — e como `registerPayment` exige um
 * `chargeId`, não há como tirá-lo desse estado pela tela.
 *
 * Ficou de fora quando a importação foi escrita (Etapa 1c) porque `Charge`
 * ainda não existia; a Etapa 2 criou a cobrança e não voltou aqui.
 *
 * ⚠️ Mora fora de `service.ts` de propósito: aquele módulo carrega
 * `lib/crypto`, que exige `CREDENTIAL_KEY` já no import. O backfill da base
 * já importada (`scripts/backfill-imported-charges.ts`) só faz conta de
 * data e centavos — pedir a chave de credencial de produção pra isso é
 * expor um segredo que a tarefa não usa.
 */
export function buildImportedFirstCharge(params: {
  subscriptionId: string;
  customerId: string;
  supplierId: string | null;
  priceCents: bigint;
  costCents: bigint;
  cycle: BillingCycle;
  nextDueAt: Date;
  timezone: string;
}): Prisma.ChargeUncheckedCreateInput {
  return {
    subscriptionId: params.subscriptionId,
    customerId: params.customerId,
    supplierId: params.supplierId,
    principalCents: params.priceCents,
    // A planilha não traz desconto: o preço importado já é o que o assinante paga.
    discountCents: 0n,
    costCents: params.costCents,
    periodStart: periodStartForDue({ dueAt: params.nextDueAt, cycle: params.cycle, timezone: params.timezone }),
    periodEnd: localDateOnly(params.nextDueAt, params.timezone),
    dueAt: params.nextDueAt,
  };
}
