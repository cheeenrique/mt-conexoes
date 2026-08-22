import { localDateOnly } from '@/core/dates';
import { EMPTY_CUSTOMER_FICHA_FORM } from '../../ficha-schema';
import type { CustomerFichaFormInput } from '../../ficha-schema';
import type { CustomerFichaData } from '../../ficha-types';

/**
 * Ficha lida → valores do formulário de edição.
 *
 * Módulo sem `'use client'` de propósito: é função pura compartilhada, e
 * exportar utilitário de um módulo cliente estoura em runtime quando um Server
 * Component a chama (antipadrão já cometido com `fichaSubtitle`).
 *
 * ⚠️ `accessPassword` sai **vazio**, sempre. A senha não volta do servidor —
 * não existe em `CustomerFichaData` para começo de conversa.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Vencimento é conceito local: 'YYYY-MM-DD' no fuso do negócio, não no do navegador. */
export function localDateInputValue(iso: string, timezone: string): string {
  const local = localDateOnly(new Date(iso), timezone);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

export function fichaFormValues(data: CustomerFichaData): CustomerFichaFormInput {
  const subscription = data.subscription;
  return {
    ...EMPTY_CUSTOMER_FICHA_FORM,
    name: data.name,
    phone: data.phone ?? '',
    email: data.email ?? '',
    document: data.document ?? '',
    notes: data.notes ?? '',
    planId: subscription?.planId ?? '',
    supplierId: subscription?.supplierId ?? '',
    priceCents: subscription?.priceCents ?? '0',
    costCents: subscription?.costCents ?? '0',
    cycle: (subscription?.cycle as CustomerFichaFormInput['cycle']) ?? 'MONTHLY',
    nextDueAt: subscription ? localDateInputValue(subscription.nextDueAt, data.timezone) : '',
    screens: subscription?.screens ?? 1,
    status: subscription?.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
    accessUsername: subscription?.accessUsername ?? '',
    accessPassword: '',
  };
}
