import { isCustomerSituationFilter } from '@/core/customer-situation';
import { resolvePerPage } from '@/components/ui/data-table-paging';

export type CustomersSearchParams = {
  page?: string;
  perPage?: string;
  q?: string;
  situacao?: string;
  plano?: string;
  fornecedor?: string;
};

/** `situacao` vindo da URL só vira filtro se for um chip conhecido — link antigo
 *  ou lixo colado caem fora e a tela mostra todos, em vez de erro. */
export function parseCustomersSearchParams(params: CustomersSearchParams) {
  const situacao = params.situacao ?? '';
  return {
    page: Math.max(1, Number(params.page) || 1),
    perPage: resolvePerPage(params.perPage),
    q: params.q ?? '',
    situation: isCustomerSituationFilter(situacao) ? situacao : undefined,
    planId: params.plano ?? '',
    supplierId: params.fornecedor ?? '',
  };
}
