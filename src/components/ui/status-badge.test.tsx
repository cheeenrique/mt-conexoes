import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renderiza o texto e aplica a cor da faixa', () => {
    render(<StatusBadge tone="success">Pago</StatusBadge>);
    const badge = screen.getByText('Pago');
    expect(badge).toHaveClass('text-success');
  });

  it('nunca depende só de cor — sempre tem texto', () => {
    render(<StatusBadge tone="danger">Falha</StatusBadge>);
    expect(screen.getByText('Falha')).toBeInTheDocument();
  });

  it('tom brand aplica a cor de marca', () => {
    render(<StatusBadge tone="brand">Novo</StatusBadge>);
    expect(screen.getByText('Novo')).toHaveClass('text-brand-light');
  });
});
