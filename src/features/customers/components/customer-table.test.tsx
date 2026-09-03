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
