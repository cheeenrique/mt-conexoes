import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { assertAnonymizable } from '@/core/anonymization';
import { anonymizeCustomerRow } from '@/features/customers/service';
import { scrubSubscriptionAccess } from '@/features/subscriptions/service';
import { scrubCustomerMessages } from '@/features/messaging/service';
import { scrubLeadsOfCustomer } from '@/features/leads/service';

export class CustomerNotFoundError extends DomainError {
  constructor(cause?: unknown) {
    super('Este cliente não existe mais.', 'CUSTOMER_NOT_FOUND', { cause });
  }
}

export class CustomerNotAnonymizableError extends DomainError {
  constructor(reason: string, cause?: unknown) {
    super(reason, 'CUSTOMER_NOT_ANONYMIZABLE', { cause });
  }
}

/**
 * Direito de eliminação (LGPD), num commit só — a trava, o cliente, a
 * assinatura, a mensagem e o lead.
 *
 * Mora em `app/` porque cruza quatro features (`.claude/rules/01-arquitetura.md`
 * §Matriz de import — mesma razão de `customer-onboarding.ts`). Fica fora do
 * arquivo `'use server'` pra continuar chamável direto pelo teste de
 * integração, sem sessão, e pra `anonymizeCustomerAction` continuar sendo só
 * casca (sessão, chamada, revalidate).
 *
 * A trava roda **dentro** da transação, com os mesmos dados que ela vai gravar
 * em cima: ler fora e escrever dentro abriria uma janela onde uma cobrança
 * pode virar `OVERDUE` (cron `charges-mark-overdue`) entre o "pode anonimizar"
 * e o commit.
 *
 * Já anonimizado é no-op, não erro — a tela some com o botão depois da primeira
 * vez (ficha em leitura), então uma segunda chamada só existe por aba
 * duplicada/clique duplo, e rodar de novo não pode reabrir o que já foi
 * fechado.
 */
export async function anonymizeCustomer(customerId: string, userId: string, now: Date): Promise<void> {
  await db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { id: true, anonymizedAt: true },
    });
    if (!customer) throw new CustomerNotFoundError();
    if (customer.anonymizedAt) return;

    const [activeSubscriptionCount, openChargeCount] = await Promise.all([
      tx.subscription.count({ where: { customerId, status: 'ACTIVE' } }),
      tx.charge.count({ where: { customerId, status: { in: ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] } } }),
    ]);

    const check = assertAnonymizable({ activeSubscriptionCount, openChargeCount });
    if (!check.ok) throw new CustomerNotAnonymizableError(check.reason);

    await anonymizeCustomerRow(tx, customerId, userId, now);
    await scrubSubscriptionAccess(tx, customerId);
    await scrubCustomerMessages(tx, customerId);
    await scrubLeadsOfCustomer(tx, customerId);
  });
}
