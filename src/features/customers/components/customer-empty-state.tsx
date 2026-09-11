'use client';

import { useRouter } from 'next/navigation';
import { SearchX, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { NewCustomerButton } from './new-customer-button';
import type { FichaPlanOption, FindCustomerByPhone, SaveCustomerFicha } from '../ficha-types';

/**
 * Os dois vazios da lista de Clientes. "Sem resultado" e "base vazia" pedem
 * saídas diferentes: um limpa o filtro, o outro cadastra o primeiro cliente —
 * "Nenhum registro encontrado" não é empty state (`.claude/rules/04-frontend.md`).
 */
export function CustomerEmptyState({
  filtered,
  plans,
  suppliers,
  saveFicha,
  checkPhone,
}: {
  filtered: boolean;
  plans: FichaPlanOption[];
  suppliers: { id: string; name: string }[];
  saveFicha: SaveCustomerFicha;
  checkPhone?: FindCustomerByPhone;
}) {
  const router = useRouter();

  if (filtered) {
    return (
      <EmptyState
        icon={SearchX}
        title="Nenhum cliente com esses filtros"
        description="Ninguém na base casa com a busca e a situação escolhidas."
        action={
          <Button variant="outline" onClick={() => router.push('/customers')}>
            <X aria-hidden="true" />
            Limpar filtros
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={Users}
      title="Nenhum cliente ainda"
      description="Cadastre o assinante que usa o serviço para o sistema começar a cobrar sozinho."
      action={<NewCustomerButton plans={plans} suppliers={suppliers} saveFicha={saveFicha} checkPhone={checkPhone} />}
    />
  );
}
