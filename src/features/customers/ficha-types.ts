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

/** Desfaz o opt-out (T5). Composta em `app/`: a regra é de mensageria. */
export type ResumeMessaging = (
  customerId: string,
) => Promise<{ ok: true } | { error: { code: string; message: string } }>;

export interface CustomerFichaData {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  situation: CustomerSituation;
  /** Offset em dias da cobrança em aberto mais antiga, para o contador do badge. */
  daysFromDue: number | null;
  /** T5: pediu para não receber mensagem. Global, em todos os canais. */
  optedOut: boolean;
  optedOutAt: string | null;
  optedOutReason: string | null;
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

/**
 * Cobrança em aberto que ficou com o valor do plano anterior. Devolvida pela
 * gravação quando **o plano** mudou, para a tela oferecer o realinhamento —
 * nunca aplicada sozinha: reajuste combinado para o próximo ciclo também mexe
 * no preço, e ali a cobrança corrente está certa.
 *
 * Centavos como string: nenhum componente cliente recebe `BigInt`.
 */
export interface StaleOpenChargeDTO {
  chargeId: string;
  fromCents: string;
  toCents: string;
}

/** Troca rápida de plano — clique na coluna "Plano" da tabela de Clientes. */
export type ChangePlan = (
  subscriptionId: string,
  customerId: string,
  planId: string,
) => Promise<
  { ok: true; staleOpenCharge: StaleOpenChargeDTO | null } | { error: { code: string; message: string } }
>;

/** Traz a cobrança em aberto para o valor que a assinatura diz hoje. */
export type RealignCharge = (
  chargeId: string,
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
  /** Preenchida quando a gravação trocou o plano e deixou a cobrança em aberto para trás. */
  staleOpenCharge?: StaleOpenChargeDTO | null;
}

export type SaveCustomerFicha = (
  input: unknown,
  ids: SaveCustomerIds,
) => Promise<SaveCustomerOk | { error: { code: string; message: string } }>;

export type FindCustomerByPhone = (phone: string) => Promise<{ id: string; name: string } | null>;
