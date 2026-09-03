import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CustomerTable } from './customer-table';
import type { CustomerListRowDTO } from '../queries';

const push = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => new URLSearchParams(),
}));

const ROW: CustomerListRowDTO = {
  id: 'cliente-1',
  name: 'Maria Teste',
  phone: '+5511999990000',
  email: null,
  document: null,
  notes: null,
  subscriptionId: 'assinatura-1',
  planId: 'plano-1',
  planName: 'Plano Mensal',
  supplierName: 'Fornecedor Teste',
  nextDueAt: null,
  situation: 'ACTIVE',
};

function setup(overrides: Partial<Parameters<typeof CustomerTable>[0]> = {}) {
  const softDeleteCustomer = vi.fn().mockResolvedValue({ ok: true });
  render(
    <CustomerTable
      rows={[ROW]}
      total={1}
      page={1}
      perPage={10}
      filtered={false}
      timezone="America/Sao_Paulo"
      plans={[]}
      suppliers={[]}
      saveFicha={vi.fn()}
      softDeleteCustomer={softDeleteCustomer}
      {...overrides}
    />,
  );
  return { softDeleteCustomer };
}

describe('CustomerTable — Remover (soft delete)', () => {
  it('sem a prop softDeleteCustomer, o botão nem aparece', () => {
    setup({ softDeleteCustomer: undefined });
    expect(screen.queryByRole('button', { name: 'Remover cliente' })).not.toBeInTheDocument();
  });

  // `DataTable` renderiza a linha duas vezes no DOM (cartão mobile + `<table>`
  // desktop, alternados por CSS que o jsdom não aplica) — escopar em `<table>`
  // evita "Found multiple elements" por um botão que existe duas vezes por
  // design, não por bug.
  function desktopTable() {
    return within(screen.getByRole('table'));
  }

  it('clicar em Remover abre confirmação antes de chamar a action', async () => {
    const user = userEvent.setup();
    const { softDeleteCustomer } = setup();

    await user.click(desktopTable().getByRole('button', { name: 'Remover cliente' }));

    expect(softDeleteCustomer).not.toHaveBeenCalled();
    expect(screen.getByText('Remover "Maria Teste"?')).toBeInTheDocument();
  });

  it('confirmar chama a action com o id certo e atualiza a tela', async () => {
    const user = userEvent.setup();
    const { softDeleteCustomer } = setup();

    await user.click(desktopTable().getByRole('button', { name: 'Remover cliente' }));
    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(softDeleteCustomer).toHaveBeenCalledWith('cliente-1');
    expect(refresh).toHaveBeenCalled();
  });

  it('cliente já removido ou anonimizado não ganha o botão de novo', () => {
    setup({ rows: [{ ...ROW, situation: 'DELETED' }] });
    expect(screen.queryByRole('button', { name: 'Remover cliente' })).not.toBeInTheDocument();
  });
});

const PLANS = [
  { id: 'plano-1', name: 'Plano Mensal', priceCents: '5000', costCents: '2000', cycle: 'MONTHLY', supplierId: null },
  { id: 'plano-2', name: 'Plano Trimestral', priceCents: '13000', costCents: '5000', cycle: 'QUARTERLY', supplierId: null },
];

describe('CustomerTable — troca rápida de plano', () => {
  function desktopTable() {
    return within(screen.getByRole('table'));
  }

  it('sem a prop changePlan, a célula de plano é só texto', () => {
    setup({ plans: PLANS });
    expect(screen.queryByRole('button', { name: /Plano Mensal/ })).not.toBeInTheDocument();
    expect(desktopTable().getByText('Plano Mensal')).toBeInTheDocument();
  });

  it('assinatura sem id (sem assinatura de verdade) não vira clicável, mesmo com changePlan', () => {
    setup({ plans: PLANS, changePlan: vi.fn(), rows: [{ ...ROW, subscriptionId: null }] });
    expect(screen.queryByRole('button', { name: /Plano Mensal/ })).not.toBeInTheDocument();
  });

  it('clicar no plano revela o select com o plano atual selecionado', async () => {
    const user = userEvent.setup();
    setup({ plans: PLANS, changePlan: vi.fn() });

    await user.click(desktopTable().getByRole('button', { name: /Plano Mensal/ }));

    const gatilho = desktopTable().getByRole('combobox', { name: /Trocar plano de Maria Teste/ });
    expect(gatilho).toHaveTextContent('Plano Mensal');
  });

  it('escolher outro plano chama changePlan com os ids certos e atualiza a tela', async () => {
    const user = userEvent.setup();
    const changePlan = vi.fn().mockResolvedValue({ ok: true });
    setup({ plans: PLANS, changePlan });

    await user.click(desktopTable().getByRole('button', { name: /Plano Mensal/ }));
    const gatilho = desktopTable().getByRole('combobox', { name: /Trocar plano de Maria Teste/ });
    gatilho.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(changePlan).toHaveBeenCalledWith('assinatura-1', 'cliente-1', 'plano-2');
    expect(refresh).toHaveBeenCalled();
  });
});
