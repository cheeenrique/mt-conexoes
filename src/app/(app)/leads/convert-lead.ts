import { findCustomerIdByPhone } from '@/features/customers/service';
import { assertLeadConvertible, markLeadConverted } from '@/features/leads/service';
import { db } from '@/lib/db';
import { saveCustomerWithSubscription } from '../customers/customer-onboarding';
import type { CustomerFichaFormValues } from '@/features/customers/ficha-schema';

/**
 * Conversão de lead em cliente (handoff `telas/08-leads.md` §"Converter em
 * cliente"): o mesmo drawer de novo cliente, já preenchido, cria **cliente,
 * assinatura e primeira cobrança** e marca o lead como convertido — tudo no
 * mesmo commit, via `saveCustomerWithSubscription`.
 *
 * Mora em `app/` porque cruza `features/leads`, `features/customers` e
 * `features/subscriptions`, e `app/` é a única camada que pode
 * (`.claude/rules/01-arquitetura.md` §Matriz de import).
 */

export interface ConvertLeadResult {
  customerId: string;
  subscriptionId: string | null;
  /** `true` quando já havia cliente com aquele WhatsApp — nada novo foi criado. */
  reusedExistingCustomer: boolean;
  customerName: string;
}

/**
 * ⚠️ Cliente que já existe **não ganha uma assinatura a mais** aqui.
 *
 * Assinatura não tem constraint que impeça duas pro mesmo cliente. Se a
 * conversão criasse uma assinatura sempre, o mesmo lead reenviado — ou dois
 * operadores no mesmo lead — daria duas assinaturas ativas, cada uma com sua
 * cobrança em aberto (o índice único parcial é *por assinatura*, então ele não
 * pega esse caso), e a régua cobraria a pessoa duas vezes no mesmo dia.
 *
 * Quem já é cliente e volta pelo formulário quase sempre quer renovar ou
 * reativar o que já tem, não uma segunda linha. Uma segunda assinatura de
 * verdade é decisão deliberada — e a tela para isso é a ficha do cliente, não
 * um formulário do site. Aqui o lead só é vinculado, e a tela diz isso ao
 * operador **antes** dele preencher a assinatura.
 *
 * A checagem por telefone é só um palpite (`Customer.phone` não é mais
 * `@@unique` — ver `features/customers/service.ts`), sem trava de banco por
 * trás: duas conversões do mesmo telefone em paralelo podem, dependendo do
 * timing, criar dois clientes em vez de reconciliar num só. Mesmo risco que
 * o resto do cadastro manual corre agora — aceito porque conversão de lead é
 * ação de operador único, não tráfego concorrente de verdade.
 */
export async function convertLeadToCustomer(
  leadId: string,
  values: CustomerFichaFormValues,
): Promise<ConvertLeadResult> {
  await assertLeadConvertible(leadId);

  const existing = await findCustomerIdByPhone(values.phone);
  if (existing) return linkToExisting(leadId, existing);

  const { customerId, subscriptionId } = await saveCustomerWithSubscription({
    customerId: null,
    subscriptionId: null,
    values,
    alsoInTransaction: (tx, id) => markLeadConverted(tx, leadId, id),
  });
  return { customerId, subscriptionId, reusedExistingCustomer: false, customerName: values.name };
}

async function linkToExisting(leadId: string, customer: { id: string; name: string }): Promise<ConvertLeadResult> {
  await markLeadConverted(db, leadId, customer.id);
  return {
    customerId: customer.id,
    subscriptionId: null,
    reusedExistingCustomer: true,
    customerName: customer.name,
  };
}
