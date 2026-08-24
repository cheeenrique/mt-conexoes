'use client';

import * as React from 'react';
import type { SelectOption } from './select';

/** Remove acento e caixa pra comparar busca de forma tolerante ("sao" acha "São"). */
function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Estado e navegação por teclado do campo de busca dentro do popup do
 * `Select`. Extraído do componente pra manter `select.tsx` dentro do
 * orçamento de tamanho (`01-arquitetura.md`) — a lógica não tem JSX próprio,
 * só estado e handlers.
 */
export function useSelectSearch(options: SelectOption[]) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const itemRefs = React.useRef<(HTMLElement | null)[]>([]);

  const filtered = search
    ? options.filter((opt) => normalizeForSearch(opt.label).includes(normalizeForSearch(search)))
    : options;

  // Limpa a busca no próprio handler de abertura (evento), não num efeito —
  // reduz um render em cascata e continua garantindo lista completa a cada abertura.
  function handleOpenChange(next: boolean) {
    if (next) setSearch('');
    setOpen(next);
  }

  React.useEffect(() => {
    if (!open) return;
    // Popup monta via portal — espera o frame seguinte pra garantir que o
    // input já existe no DOM antes de focar. Roda depois do foco inicial que
    // o base-ui aplica ao abrir, então vence a disputa por foco de propósito.
    const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  function focusItemAt(index: number) {
    itemRefs.current[index]?.focus();
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItemAt(0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItemAt(filtered.length - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItemAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusItemAt(filtered.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        focusItemAt(0);
        break;
      case 'Escape':
        // Deixa o base-ui fechar o popup (dismiss ouve Esc fora deste campo).
        break;
      default:
        // Não deixa a letra digitada acionar o typeahead nativo da lista
        // enquanto o operador está filtrando pela busca.
        event.stopPropagation();
    }
  }

  return { open, onOpenChange: handleOpenChange, search, setSearch, filtered, searchInputRef, itemRefs, handleSearchKeyDown };
}
