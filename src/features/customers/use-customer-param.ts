'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

const PARAM = 'cliente';

/**
 * `?cliente=<id>` abre a ficha em gaveta sobre a lista.
 *
 * A troca do parâmetro vai por `history.pushState`, não por `router.push`: o
 * handoff 04 §Regras exige que "o drawer não recarrega a tela de trás; ao
 * fechar, a lista continua na mesma página e com os mesmos filtros". Uma
 * navegação de verdade re-renderizaria o Server Component da lista e piscaria o
 * `loading.tsx` por cima dela. O App Router instrumenta `pushState`, então
 * `useSearchParams` continua enxergando a mudança e o botão Voltar do navegador
 * fecha a gaveta.
 */
export function useCustomerParam() {
  const searchParams = useSearchParams();
  const customerId = searchParams.get(PARAM);

  const openCustomer = useCallback((id: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set(PARAM, id);
    window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, []);

  const closeCustomer = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete(PARAM);
    const query = params.toString();
    window.history.pushState(null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, []);

  return { customerId, openCustomer, closeCustomer };
}
