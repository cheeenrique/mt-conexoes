import type { Prisma } from '@prisma/client';
import { encrypt } from '@/lib/crypto';
import { buildImportedFirstCharge } from './imported-charge';

/** A planilha de origem não tem coluna de ciclo — toda linha importada é mensal. */
const IMPORTED_CYCLE = 'MONTHLY' as const;

/**
 * Criação de assinatura pela importação da base — única exceção no app que
 * NÃO calcula `nextDueAt` via `firstDueDate`. A planilha de origem só tem o
 * vencimento atual (controlado na mão pelo cliente), nunca um histórico de
 * pagamento — decisão registrada em docs/superpowers/specs/2026-08-07-etapa-1c-importacao-design.md.
 * A partir do primeiro pagamento registrado no sistema novo, a regra normal
 * (pagamento → próximo vencimento) passa a valer.
 *
 * Recebe `tx`: a orquestração (`app/(app)/customers/customer-import.ts`)
 * processa a planilha em blocos de ~500 linhas, cada bloco num commit só —
 * a checagem de idempotência, a resolução do `Customer` e esta criação
 * precisam estar na mesma transação.
 */
export async function createImportedSubscription(
  tx: Prisma.TransactionClient,
  params: {
    customerId: string;
    supplierId: string;
    priceCents: bigint;
    costCents: bigint;
    nextDueAt: Date;
    startedAt: Date;
    accessUsername: string | null;
    accessPassword: string | null;
    screens: number;
    timezone: string;
  },
): Promise<{ id: string }> {
  const subscription = await tx.subscription.create({
    data: {
      customerId: params.customerId,
      supplierId: params.supplierId,
      priceCents: params.priceCents,
      costCents: params.costCents,
      cycle: IMPORTED_CYCLE,
      nextDueAt: params.nextDueAt,
      startedAt: params.startedAt,
      accessUsername: params.accessUsername,
      accessPasswordEnc: params.accessPassword ? encrypt(params.accessPassword, 'subscription.accessPassword') : null,
      screens: params.screens,
    },
    select: { id: true },
  });

  await tx.charge.create({
    data: buildImportedFirstCharge({
      subscriptionId: subscription.id,
      customerId: params.customerId,
      supplierId: params.supplierId,
      priceCents: params.priceCents,
      costCents: params.costCents,
      cycle: IMPORTED_CYCLE,
      nextDueAt: params.nextDueAt,
      timezone: params.timezone,
    }),
  });

  return subscription;
}


/**
 * Idempotência da importação — checado ANTES de tocar em `Customer`, porque
 * telefone nulo não serve de chave de upsert (`WHERE phone IS NULL` bateria
 * em qualquer cliente sem telefone, não no cliente certo desta linha).
 */
export async function findImportedSubscriptionBySupplier(
  tx: Prisma.TransactionClient,
  params: { supplierId: string; accessUsername: string },
): Promise<{ id: string } | null> {
  return tx.subscription.findFirst({
    where: { supplierId: params.supplierId, accessUsername: params.accessUsername },
    select: { id: true },
  });
}
