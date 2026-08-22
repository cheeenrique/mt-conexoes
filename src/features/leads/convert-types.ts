/**
 * Contrato entre o drawer de conversão (`features/leads`) e a Server Action
 * que o alimenta (`app/(app)/leads/convert-lead-action.ts`). Tipos primitivos: a
 * feature não importa DTO de `customers` nem de `subscriptions`, e a action
 * chega ao componente por prop.
 *
 * A action real tem a assinatura de `SaveCustomerFicha`
 * (`features/customers/ficha-types.ts`) — mesmo contrato da gaveta de novo
 * cliente, porque a conversão de lead reaproveita a gravação de
 * cliente+assinatura. Os tipos abaixo espelham essa forma estruturalmente,
 * sem importar de `features/customers` (`.claude/rules/01-arquitetura.md`
 * §Matriz de import).
 */

export interface ConvertLeadIds {
  /** Sempre `null` aqui: conversão de lead sempre cria cliente e assinatura novos. */
  customerId: string | null;
  subscriptionId: string | null;
  leadId?: string;
}

export interface ConvertLeadOutcome {
  customerId: string;
  subscriptionId: string | null;
  /**
   * `true` quando já havia cliente com esse WhatsApp. Nesse caso o lead foi
   * **vinculado** ao cadastro existente e **nenhuma assinatura foi criada** —
   * a tela precisa dizer isso, porque as duas conversões terminam com o lead
   * em `Convertido` e só uma cobra alguém.
   */
  reusedExistingCustomer?: boolean;
  customerName?: string;
}

export type ConvertLeadResult =
  | ({ ok: true } & ConvertLeadOutcome)
  | { error: { code: string; message: string } };

export type ConvertLead = (input: unknown, ids: ConvertLeadIds) => Promise<ConvertLeadResult>;

/**
 * Mesma forma de `FindCustomerByPhone` (`features/customers/ficha-types.ts`),
 * espelhada aqui pelo mesmo motivo do resto do arquivo — sem importar de
 * `features/customers`. Usada para avisar **antes** de converter quando o
 * WhatsApp do lead já é de um cliente, em vez de só depois do envio.
 */
export type FindCustomerByPhone = (phone: string) => Promise<{ id: string; name: string } | null>;
