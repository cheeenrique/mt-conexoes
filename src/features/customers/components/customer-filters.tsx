'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { CUSTOMER_OTHER_FILTERS } from '@/core/customer-situation';
import { CUSTOMER_SITUATION_LABELS } from '@/lib/labels';
import { Select } from '@/components/ui/select';
import { CustomerTriageBar } from './customer-triage-bar';
import type { CustomerSituationCounts } from '../queries';

const DEBOUNCE_MS = 300;

// Estados fora da triagem diária. Ficam num select em vez de chip porque
// competiam por atenção com "Em atraso" sendo consultados uma vez por mês.
const OTHER_OPTIONS = [
  { value: '', label: 'Outros estados' },
  ...CUSTOMER_OTHER_FILTERS.map((value) => ({ value, label: CUSTOMER_SITUATION_LABELS[value] })),
];

/**
 * Filtros da tela de Clientes, em duas faixas com pesos diferentes: a barra de
 * triagem em cima (a escada de vencimento, com quantos há em cada degrau) e o
 * refinamento embaixo (busca, plano, fornecedor, outros estados). Separadas
 * porque respondem a perguntas diferentes — "o que precisa da minha atenção
 * hoje" e "me mostra este recorte da base".
 *
 * A fileira única de oito chips que existia antes tratava "Em atraso" e
 * "Anonimizado" com o mesmo peso, e quebrava em duas linhas na largura normal
 * do painel.
 *
 * Tudo vive em `searchParams`: o operador manda o link do filtro para si mesmo
 * e o botão Voltar funciona. A situação é **um parâmetro só** (`situacao`),
 * com duas portas de entrada — escolher em "Outros estados" tira o degrau
 * ativo da barra, e vice-versa.
 *
 * A busca espera 300 ms antes de navegar (handoff 03 §Busca). Sem isso cada
 * tecla vira uma navegação e uma query — digitar "Fernanda" disparava oito.
 */
export function CustomerFilters({
  q,
  situation,
  planId,
  supplierId,
  plans,
  suppliers,
  counts,
}: {
  q: string;
  situation: string;
  planId: string;
  supplierId: string;
  plans: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  counts: CustomerSituationCounts;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function urlWith(key: string, value: string): string {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page'); // filtro novo volta para a página 1
    const query = params.toString();
    return query ? `/customers?${query}` : '/customers';
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  // Sincroniza o campo com a URL quando ela muda por fora da digitação —
  // "Limpar filtros", botão Voltar, link colado. Escreve no DOM em vez de
  // guardar o texto em estado, e só com o campo sem foco, para não roubar o
  // cursor de quem está no meio de uma palavra.
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement !== input && input.value !== q) input.value = q;
  }, [q]);

  function handleSearch(value: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.push(urlWith('q', value)), DEBOUNCE_MS);
  }

  const otherSituation = OTHER_OPTIONS.some((option) => option.value === situation) ? situation : '';

  return (
    <>
      <CustomerTriageBar
        situation={situation}
        counts={counts}
        onSelect={(next) => router.push(urlWith('situacao', next))}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <div className="flex h-10 min-w-56 flex-1 items-center gap-2 rounded-badge border border-border bg-surface-elevated px-3">
          <Search size={16} className="text-foreground-muted" aria-hidden />
          <label htmlFor="customer-search" className="sr-only">
            Buscar cliente
          </label>
          <input
            ref={inputRef}
            id="customer-search"
            defaultValue={q}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Nome, telefone ou usuário de acesso"
            className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
          />
        </div>
        <Select
          aria-label="Filtrar por plano"
          placeholder="Todos os planos"
          value={planId}
          onValueChange={(next) => router.push(urlWith('plano', next))}
          options={[{ value: '', label: 'Todos os planos' }, ...plans.map((plan) => ({ value: plan.id, label: plan.name }))]}
          className="h-10 w-44"
        />
        <Select
          aria-label="Filtrar por fornecedor"
          placeholder="Todos os fornecedores"
          value={supplierId}
          onValueChange={(next) => router.push(urlWith('fornecedor', next))}
          options={[{ value: '', label: 'Todos os fornecedores' }, ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))]}
          className="h-10 w-48"
        />
        <Select
          aria-label="Filtrar por outros estados"
          placeholder="Outros estados"
          value={otherSituation}
          onValueChange={(next) => router.push(urlWith('situacao', next))}
          options={OTHER_OPTIONS}
          className="h-10 w-44"
        />
      </div>
    </>
  );
}
