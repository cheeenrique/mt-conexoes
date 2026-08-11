import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreakdownTable } from './breakdown-table';

describe('BreakdownTable', () => {
  it('renderiza nome, faturado, custo, lucro e margem por linha', () => {
    render(<BreakdownTable rows={[{ id: '1', name: 'Tubarão', billedCents: '10000', costCents: '4000' }]} emptyLabel="Sem dados" />);
    expect(screen.getByText('Tubarão')).toBeInTheDocument();
    expect(screen.getByText(/60%/)).toBeInTheDocument(); // (10000-4000)/10000
  });

  it('lista vazia mostra o texto de vazio, sem tabela', () => {
    render(<BreakdownTable rows={[]} emptyLabel="Sem dados no período" />);
    expect(screen.getByText('Sem dados no período')).toBeInTheDocument();
  });
});
