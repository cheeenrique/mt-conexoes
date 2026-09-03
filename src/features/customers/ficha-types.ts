import type { CustomerSituation } from '@/core/customer-situation';

/**
 * Forma da ficha do cliente (handoff `telas/04-ficha-cliente.md`). Tipos
 * primitivos de propósito: o payload é montado em `app/`, que é a única camada
 * que pode compor queries de várias features, e consumido por um componente de
 * `features/customers` — nenhuma das duas pontas importa DTO da outra feature.
 *
 * ⚠️ A senha de acesso **não existe aqui**. Ela só sai pela ação de revelação,
 * que audita antes de devolver o valor.
 */

export interface FichaSubscriptionDTO {
  id: string;
  planId: string | null;
  supplierId: string | null;
  planName: string | null;
  supplierName: string | null;
  cycle: string;
  status: string;
  priceCents: string;
  costCents: string;
  nextDueAt: string;
  screens: number;
  accessUsername: string | null;
  hasAccessPassword: boolean;
}

export interface FichaPaymentDTO {
  id: string;
  paidAt: string;
  method: string;
  amountCents: string;
  chargeStatus: string;
}

export interface FichaMessageDTO {
  id: string;
  status: string;
  body: string;
  at: string;
  failReason: string | null;
  cancelReason: string | null;
}

/** Opção de `<select>`. Sem domínio: id e rótulo, mais o que o plano sugere. */
export interface FichaPlanOption {
  id: string;
  name: string;
  priceCents: string;
  costCents: string;
  cycle: string;
  supplierId: string | null;
}

export interface CustomerFichaData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  situation: CustomerSituation;
  supplierName: string | null;
  sinceAt: string | null;
  timezone: string;
  /** Lucro acumulado: faturado, recebido e custo em centavos, como string. */
  billedCents: string;
  receivedCents: string;
  costCents: string;
  renewalCount: number;
  subscription: FichaSubscriptionDTO | null;
  payments: FichaPaymentDTO[];
  messages: FichaMessageDTO[];
  /** Opções dos selects do modo edição — viajam com a ficha para a gaveta não depender da rota que a montou. */
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
}

export type LoadCustomerFicha = (
  customerId: string,
) => Promise<{ data: CustomerFichaData } | { error: { code: string; message: string } }>;

export type RevealAccessPassword = (
  subscriptionId: string,
) => Promise<{ ok: true; value: string } | { error: { code: string; message: string } }>;

/** Direito de eliminação (LGPD) — irreversível. Ver `customer-anonymization.ts`. */
export type AnonymizeCustomer = (
  customerId: string,
) => Promise<{ ok: true } | { error: { code: string; message: string } }>;

/** Ids que a gravação precisa e que não são campo de formulário. */
export interface SaveCustomerIds {
  /** `null` cria o cliente; preenchido edita. */
  customerId: string | null;
  /** `null` cria a assinatura; preenchido edita a que já existe. */
  subscriptionId: string | null;
  /** Preenchido só quando a gaveta foi aberta a partir de um lead. */
  leadId?: string;
}

export interface SaveCustomerOk {
  ok: true;
  customerId: string;
  subscriptionId: string | null;
  /** `true` quando o WhatsApp já pertencia a um cliente e nada novo foi criado. */
  reusedExistingCustomer?: boolean;
  customerName?: string;
}

export type SaveCustomerFicha = (
  input: unknown,
  ids: SaveCustomerIds,
) => Promise<SaveCustomerOk | { error: { code: string; message: string } }>;

export type FindCustomerByPhone = (phone: string) => Promise<{ id: string; name: string } | null>;
