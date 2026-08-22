import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadTable } from './lead-table';
import type { LeadListRowDTO } from '../queries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = '2026-08-22T12:00:00.000Z';
const TZ = 'America/Sao_Paulo';

const PLANS = [
  { id: '019199aa-0000-7000-8000-0000000000aa', name: 'Mensal', cycle: 'MONTHLY' as const, priceCents: '5000', costCents: '2000', supplierId: null },
];
const SUPPLIERS = [{ id: '019199aa-0000-7000-8000-0000000000bb', name: 'Fornecedor' }];

const lead: LeadListRowDTO = {
  id: '019199aa-0000-7000-8000-000000000001',
  name: 'Michele Farias',
  phone: '+5562991802244',
  interestPlan: 'Trimestral',
  source: 'site · planos',
  status: 'NEW',
  createdAt: '2026-08-22T10:00:00.000Z',
  customerId: null,
};

function renderTable(rows: LeadListRowDTO[], overrides: { filtered?: boolean } = {}) {
  render(
    <LeadTable
      rows={rows}
      total={rows.length}
      page={1}
      perPage={8}
      filtered={overrides.filtered ?? false}
      nowIso={NOW}
      timezone={TZ}
      plans={PLANS}
      suppliers={SUPPLIERS}
      convertLead={vi.fn()}
    />,
  );
}

// `DataTable` renderiza tabela e cartões ao mesmo tempo (a troca é por CSS,
// no breakpoint de 900px), então cada célula aparece duas vezes no DOM de
// teste. Daí `getAllBy*` em tudo que é conteúdo de linha.
describe('LeadTable', () => {
  it('mostra o telefone formatado embaixo do nome, não o E.164 cru', () => {
    renderTable([lead]);

    expect(screen.getAllByText('Michele Farias')).not.toHaveLength(0);
    expect(screen.getAllByText('(62) 99180-2244')).not.toHaveLength(0);
  });

  it('mostra "Ainda não sei" quando o lead não marcou plano', () => {
    renderTable([{ ...lead, interestPlan: null }]);

    expect(screen.getAllByText('Ainda não sei')).not.toHaveLength(0);
  });

  // Saber qual bloco do site converte é a razão de existir do campo.
  it('preserva a origem com o bloco do site', () => {
    renderTable([lead]);

    expect(screen.getAllByText('site · planos')).not.toHaveLength(0);
  });

  it('abre a conversa do WhatsApp em nova aba, sem repassar o referrer', () => {
    renderTable([lead]);

    const link = screen.getAllByRole('link', { name: 'Abrir conversa no WhatsApp' })[0]!;
    expect(link).toHaveAttribute('href', 'https://wa.me/5562991802244');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('lead convertido leva ao cliente e não oferece converter de novo', () => {
    renderTable([{ ...lead, status: 'CONVERTED', customerId: 'cus-1' }]);

    expect(screen.getAllByRole('link', { name: 'Michele Farias' })[0]).toHaveAttribute('href', '/customers/cus-1');
    expect(screen.queryByRole('button', { name: 'Converter em cliente' })).not.toBeInTheDocument();
  });

  it('base vazia aponta para de onde os leads vêm', () => {
    renderTable([], { filtered: false });

    expect(screen.getByText('Nenhum lead ainda')).toBeInTheDocument();
  });

  // "Nenhum registro encontrado" não é empty state: os dois vazios têm causas
  // diferentes e saídas diferentes.
  it('filtro sem resultado oferece limpar o filtro', () => {
    renderTable([], { filtered: true });

    expect(screen.getByText('Nenhum lead com esses filtros')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();
  });
});
