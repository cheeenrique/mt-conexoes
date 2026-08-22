import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { insertCustomer, patchCustomer } from '@/features/customers/service';
import { insertSubscriptionWithFirstCharge, patchSubscription } from '@/features/subscriptions/service';
import type { CustomerFichaFormValues } from '@/features/customers/ficha-schema';

/**
 * Cadastro de cliente **com** assinatura, num commit só.
 *
 * Mora em `app/` porque é composição de duas features, e `app/` é a única
 * camada autorizada a cruzar features (`.claude/rules/01-arquitetura.md`
 * §Matriz de import — mesma razão de `ficha-action.ts`). Fica fora do arquivo
 * `'use server'` para a Server Action continuar sendo casca (sessão, Zod,
 * chamada, revalidate) e para o teste de integração poder chamar esta função
 * direto, sem sessão.
 *
 * ⚠️ **Uma transação só.** Dois commits deixam cliente sem assinatura — ou,
 * na conversão de lead, cliente órfão com o lead ainda `Novo` — se houver
 * crash no meio. O operador então cadastra de novo e viram dois cadastros da
 * mesma pessoa. A criação da assinatura já emite a primeira cobrança
 * (`startedAt + ciclo`), então a cobrança entra no mesmo commit.
 */

export interface SaveCustomerResult {
  customerId: string;
  subscriptionId: string | null;
}

export interface SaveCustomerParams {
  /** `null` cria; preenchido edita. */
  customerId: string | null;
  /** `null` cria a assinatura; preenchido edita a que já existe. */
  subscriptionId: string | null;
  values: CustomerFichaFormValues;
  /**
   * Escrita extra no **mesmo** commit. A conversão de lead usa para marcar o
   * lead como convertido junto com o cliente que ele virou.
   */
  alsoInTransaction?: (tx: Prisma.TransactionClient, customerId: string) => Promise<void>;
}

function toCustomerInput(values: CustomerFichaFormValues) {
  return {
    name: values.name,
    phone: values.phone,
    email: values.email ?? '',
    document: values.document ?? '',
    notes: values.notes ?? '',
  };
}

/**
 * Tradução para `features/subscriptions`. Desconto, servidor e observações de
 * acesso saem **ausentes** de propósito: a ficha não tem esses campos, e
 * `toBaseData` trata ausente como "não mexer". Mandar `''` daqui apagaria o
 * desconto vigente numa tela que nem mostra desconto.
 */
function toSubscriptionInput(values: CustomerFichaFormValues) {
  return {
    planId: values.planId ?? '',
    supplierId: values.supplierId ?? '',
    priceCents: values.priceCents,
    costCents: values.costCents,
    cycle: values.cycle,
    nextDueAt: values.nextDueAt ?? '',
    screens: values.screens,
    status: values.status || undefined,
    accessUsername: values.accessUsername ?? '',
    accessPassword: values.accessPassword ?? '',
  };
}

export async function saveCustomerWithSubscription(params: SaveCustomerParams): Promise<SaveCustomerResult> {
  // Leitura fora da transação de propósito: `getSettings` não participa do
  // commit e segurar a conexão por ela é o que trava a tela quando o pool do
  // Neon está apertado.
  const settings = await getSettings();
  const now = new Date();
  const customerInput = toCustomerInput(params.values);
  const subscriptionInput = toSubscriptionInput(params.values);

  return db.$transaction(async (tx) => {
    const customer = params.customerId
      ? await patchCustomer(tx, params.customerId, customerInput)
      : await insertCustomer(tx, customerInput);

    const subscription = params.subscriptionId
      ? await patchSubscription(tx, {
          id: params.subscriptionId,
          customerId: customer.id,
          input: subscriptionInput,
          timezone: settings.timezone,
          now,
        })
      : await insertSubscriptionWithFirstCharge(tx, {
          customerId: customer.id,
          input: subscriptionInput,
          timezone: settings.timezone,
          startedAt: now,
        });

    await params.alsoInTransaction?.(tx, customer.id);

    return { customerId: customer.id, subscriptionId: subscription.id };
  });
}
