import { formatLocalMonthYear } from '@/lib/format';
import type { CustomerFichaData } from '../../ficha-types';

/**
 * "Fornecedor Tubarão · cliente desde 03/2021" — a linha de apoio do cabeçalho
 * da ficha. Fica fora do módulo `'use client'` de propósito: a rota
 * `/customers/<id>` é Server Component e chamar uma função exportada de um
 * módulo cliente estoura em runtime ("Attempted to call fichaSubtitle() from
 * the server"), sem o build acusar nada.
 */
export function fichaSubtitle(data: CustomerFichaData): string {
  const parts: string[] = [];
  if (data.supplierName) parts.push(`Fornecedor ${data.supplierName}`);
  if (data.sinceAt) parts.push(`cliente desde ${formatLocalMonthYear(data.sinceAt, data.timezone)}`);
  return parts.join(' · ');
}
