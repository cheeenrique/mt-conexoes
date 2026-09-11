'use client';

import { MessageCircle, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { IconActionButton } from '@/components/ui/icon-action-button';
import { whatsAppUrl } from '@/lib/format';
import type { CustomerListRowDTO } from '../queries';

/**
 * Ações da linha de Clientes. Extraído de `customer-table.tsx` quando o arquivo
 * passou do orçamento de componente (150 linhas): a tabela muda por coluna
 * nova, esta coluna muda por ação nova — dois motivos diferentes.
 */
export function CustomerRowActions({
  row,
  onOpen,
  onRemove,
  onRestore,
}: {
  row: CustomerListRowDTO;
  onOpen: (customerId: string) => void;
  /** Ausente = sem "Remover" (a tela não fiou a ação). */
  onRemove?: (customerId: string) => void;
  /** Ausente = removido fica sem volta pela tela. */
  onRestore?: (customerId: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {row.phone && (
        <IconActionButton icon={MessageCircle} label="Abrir conversa no WhatsApp" href={whatsAppUrl(row.phone)} />
      )}
      <IconActionButton icon={Pencil} label="Ver e editar cliente" onClick={() => onOpen(row.id)} />
      {/* Removido troca o botão em vez de perdê-lo: sem volta, um clique errado
          custava o cadastro até alguém mexer no banco. Anonimizado não volta —
          a eliminação apagou o dado, não escondeu. */}
      {onRestore && row.situation === 'DELETED' && (
        <IconActionButton icon={RotateCcw} label="Restaurar cliente" onClick={() => onRestore(row.id)} />
      )}
      {onRemove && row.situation !== 'DELETED' && row.situation !== 'ANONYMIZED' && (
        <IconActionButton icon={Trash2} label="Remover cliente" tone="danger" onClick={() => onRemove(row.id)} />
      )}
    </div>
  );
}
