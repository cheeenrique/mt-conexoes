import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MonthlySummaryCard } from './monthly-summary-card';
import type { MonthlySummaryDTO } from '../queries';

function makeSummary(overrides: Partial<MonthlySummaryDTO> = {}): MonthlySummaryDTO {
  return {
    billedCents: '1350000', costCents: '490000', receivedCents: '1188000',
    openCents: '162000', costAtRiskCents: '59000',
    ...overrides,
  };
}

describe('MonthlySummaryCard', () => {
  it('mostra os cinco números do mês, nesta ordem', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    const labels = ['Faturado', 'Recebido', 'Custo', 'Lucro bruto', 'Margem'];
    for (const label of labels) expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('label é "Lucro bruto"', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument();
  });

  it('margem de 64% sai verde', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText('64%')).toHaveClass('text-success');
  });

  it('margem entre 15% e 39% sai âmbar', () => {
    // 100,00 faturado, 80,00 de custo → 20%
    render(<MonthlySummaryCard summary={makeSummary({ billedCents: '10000', costCents: '8000' })} monthLabel="Agosto/2026" />);
    expect(screen.getByText('20%')).toHaveClass('text-warning');
  });

  it('margem abaixo de 15% sai vermelha', () => {
    // 100,00 faturado, 90,00 de custo → 10%
    render(<MonthlySummaryCard summary={makeSummary({ billedCents: '10000', costCents: '9000' })} monthLabel="Agosto/2026" />);
    expect(screen.getByText('10%')).toHaveClass('text-danger');
  });

  it('mês sem faturamento não tem margem, e não é pintado de vermelho', () => {
    render(
      <MonthlySummaryCard
        summary={makeSummary({ billedCents: '0', costCents: '0', openCents: '0', costAtRiskCents: '0' })}
        monthLabel="Agosto/2026"
      />,
    );
    expect(screen.getByText('—')).toHaveClass('text-foreground-muted');
  });

  it('faturado de 1 centavo aparece formatado, sem virar float', () => {
    render(<MonthlySummaryCard summary={makeSummary({ billedCents: '1', costCents: '0' })} monthLabel="Agosto/2026" />);
    expect(screen.getAllByText('R$ 0,01').length).toBeGreaterThan(0);
  });

  it('faturamento com dízima mantém a margem arredondada uma vez só', () => {
    // 33,33 dividido em três: 3333 centavos faturados, 2222 de custo → 33,3...%
    render(<MonthlySummaryCard summary={makeSummary({ billedCents: '3333', costCents: '2222' })} monthLabel="Agosto/2026" />);
    expect(screen.getByText('33%')).toHaveClass('text-warning');
    expect(screen.getByText('R$ 11,11')).toBeInTheDocument();
  });

  it('mostra margem em risco e a frase que explica o conceito', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText(/margem em risco/i)).toBeInTheDocument();
    expect(screen.getByText(/custo já pago ao fornecedor sobre cobranças não recebidas/i)).toBeInTheDocument();
  });

  it('sem custo em risco não mostra a linha de margem em risco', () => {
    render(<MonthlySummaryCard summary={makeSummary({ costAtRiskCents: '0' })} monthLabel="Agosto/2026" />);
    expect(screen.queryByText(/margem em risco/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/custo já pago ao fornecedor/i)).not.toBeInTheDocument();
  });
});
