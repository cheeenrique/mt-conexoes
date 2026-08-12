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
  it('label é "Lucro bruto"', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument();
  });

  it('mostra margem em risco quando há custo em risco', () => {
    render(<MonthlySummaryCard summary={makeSummary()} monthLabel="Agosto/2026" />);
    expect(screen.getByText(/margem em risco/i)).toBeInTheDocument();
  });

  it('sem custo em risco não mostra a linha de margem em risco', () => {
    render(<MonthlySummaryCard summary={makeSummary({ costAtRiskCents: '0' })} monthLabel="Agosto/2026" />);
    expect(screen.queryByText(/margem em risco/i)).not.toBeInTheDocument();
  });
});
