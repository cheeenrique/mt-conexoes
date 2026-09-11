import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import type { Prisma } from '@prisma/client';
import { SubscriptionNotFoundError } from './errors';

export async function revealCredential(subscriptionId: string, userId: string, ip: string | null) {
  const subscription = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription) throw new SubscriptionNotFoundError();
  if (!subscription.accessPasswordEnc) return '';

  await db.credentialReveal.create({ data: { subscriptionId, userId, ip } });
  return decrypt(subscription.accessPasswordEnc, 'subscription.accessPassword');
}

/**
 * Direito de eliminação (LGPD) — zera a credencial de acesso do assinante em
 * **todas** as assinaturas do cliente (histórico incluído, não só a vigente).
 * `assertAnonymizable` já garantiu que nenhuma está `ACTIVE`, então isto nunca
 * apaga credencial de acesso que alguém ainda usa.
 */
export async function scrubSubscriptionAccess(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
  await tx.subscription.updateMany({
    where: { customerId },
    data: { accessUsername: null, accessPasswordEnc: null, accessServer: null, accessNotes: null },
  });
}
