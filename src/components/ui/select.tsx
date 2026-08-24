'use client';

import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSelectSearch } from './use-select-search';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Select sobre a primitiva `select` do base-ui — substitui o `<select>`
 * nativo, que abre a lista do sistema operacional (sem controle de tema, sem
 * busca, posição fora do nosso controle).
 *
 * ⚠️ O campo de busca aparece em **todo** select, mesmo em lista de 3-5
 * opções fixas. Decisão do dono do produto: um select que às vezes tem busca
 * e às vezes não obriga o operador a checar qual é qual antes de digitar.
 * Consistência aqui vale mais que economizar um campo numa lista curta — não
 * remover a busca condicionalmente "pra otimizar" sem essa decisão mudar.
 */
export function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder = 'Selecionar',
  searchPlaceholder = 'Buscar...',
  emptyMessage = 'Nenhum resultado',
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  const { open, onOpenChange, search, setSearch, filtered, searchInputRef, itemRefs, handleSearchKeyDown } =
    useSelectSearch(options);

  return (
    <SelectPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next ?? '')}
      open={open}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          'flex h-11 w-full items-center gap-2 rounded-sm border border-border bg-surface-elevated px-3 text-sm text-foreground',
          'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'data-[popup-open]:border-ring',
          className,
        )}
      >
        {/* Resolve o texto do trigger pelas nossas `options`, não pelo heurístico
            padrão do base-ui — que trata valor `''` como "nada selecionado" e
            ignoraria a opção "Nenhum"/"Todas as situações" que o projeto usa
            como escolha explícita, não como placeholder. */}
        <SelectPrimitive.Value className="flex-1 text-left">
          {() => options.find((opt) => opt.value === value)?.label ?? placeholder}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon>
          <ChevronDown size={16} className="text-foreground-muted" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          className="z-50 outline-none"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionAvoidance={{ side: 'none' }}
          alignItemWithTrigger={false}
        >
          <SelectPrimitive.Popup
            className={cn(
              'w-(--anchor-width) min-w-40 overflow-hidden rounded-md bg-popover text-popover-foreground',
              'ring-1 ring-foreground/10 shadow-md duration-100',
              'data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
              'data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-2.5">
              <Search size={14} className="shrink-0 text-foreground-muted" aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                aria-label="Buscar opção"
                className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-muted"
              />
            </div>
            <SelectPrimitive.List className="max-h-60 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-2.5 py-2 text-sm text-foreground-muted">{emptyMessage}</p>
              ) : (
                filtered.map((opt, index) => (
                  <SelectPrimitive.Item
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    className={cn(
                      'flex cursor-default items-center gap-2 rounded-badge px-2.5 py-2 text-sm text-foreground outline-none',
                      'data-highlighted:bg-surface data-selected:font-semibold',
                      'data-disabled:pointer-events-none data-disabled:opacity-40',
                    )}
                  >
                    <SelectPrimitive.ItemText className="flex-1">{opt.label}</SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check size={14} className="text-brand" aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))
              )}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
