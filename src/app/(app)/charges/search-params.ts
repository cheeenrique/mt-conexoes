import { resolvePerPage } from '@/components/ui/data-table-paging';
import { endOfLocalDay, startOfLocalDay } from '@/core/dates';

export type ChargesSearchParams = {
  page?: string;
  perPage?: string;
  q?: string;
  status?: string;
  supplierId?: string;
  dueFrom?: string;
  dueTo?: string;
};

/** Converte 'YYYY-MM-DD' em limite de dia local, sem cair na armadilha do fuso do navegador. */
function parseLocalDateBoundary(value: string, timezone: string, boundary: 'start' | 'end') {
  if (!value) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const fn = boundary === 'start' ? startOfLocalDay : endOfLocalDay;
  return fn(year, month - 1, day, timezone);
}

export function parseChargesSearchParams(params: ChargesSearchParams, timezone: string) {
  const q = params.q ?? '';
  const status = params.status ?? '';
  const supplierId = params.supplierId ?? '';
  const dueFrom = params.dueFrom ?? '';
  const dueTo = params.dueTo ?? '';
  return {
    page: Math.max(1, Number(params.page) || 1),
    perPage: resolvePerPage(params.perPage),
    /** Valores crus, para devolver aos campos do filtro. */
    raw: { q, status, supplierId, dueFrom, dueTo },
    filters: {
      q: q || undefined,
      status: status || undefined,
      supplierId: supplierId || undefined,
      dueFrom: parseLocalDateBoundary(dueFrom, timezone, 'start'),
      dueTo: parseLocalDateBoundary(dueTo, timezone, 'end'),
    },
    filtered: !!(q || status || supplierId || dueFrom || dueTo),
  };
}
