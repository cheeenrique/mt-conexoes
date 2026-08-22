import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FichaProfit } from './ficha-profit';

const TZ = 'America/Sao_Paulo';

function renderProfit(overrides: Partial<Parameters<typeof FichaProfit>[0]> = {}) {
  return render(
    <FichaProfit
      billedCents="264000"
      receivedCents="258000"
      costCents="68000"
      renewalCount={44}
      sinceAt="2021-03-15T12:00:00Z"
      timezone={TZ}
      {...overrides}
    />,
  );
}

describe('FichaProfit', () => {
  it('o rótulo é "Lucro bruto acumulado", nunca "Lucro" puro', () => {
    renderProfit();
    expect(screen.getByText('Lucro bruto acumulado')).toBeInTheDocument();
    expect(screen.queryByText(/^Lucro$/)).not.toBeInTheDocument();
  });

  it('mostra lucro, renovações, margem e desde na mesma linha de apoio', () => {
    renderProfit();
    // 264000 - 68000 = 196000 centavos; margem (264000-68000)/264000 = 74,24% → 74%
    expect(screen.getByText('R$ 1.960,00')).toBeInTheDocument();
    expect(screen.getByText(/44 renovações · margem 74% · cliente desde 03\/2021/)).toBeInTheDocument();
  });

  it('pinta o lucro pela régua de margem — 74% é saudável', () => {
    renderProfit();
    expect(screen.getByText('R$ 1.960,00').className).toContain('text-success');
  });

  it('margem crítica sai em vermelho', () => {
    renderProfit({ billedCents: '100000', costCents: '95000' });
    expect(screen.getByText('R$ 50,00').className).toContain('text-danger');
  });

  it('pluraliza renovação no singular', () => {
    renderProfit({ renewalCount: 1 });
    expect(screen.getByText(/^1 renovação ·/)).toBeInTheDocument();
  });

  it('sem faturamento não inventa margem', () => {
    renderProfit({ billedCents: '0', receivedCents: '0', costCents: '0', renewalCount: 0, sinceAt: null });
    expect(screen.getByText('0 renovações')).toBeInTheDocument();
    expect(screen.queryByText(/margem/)).not.toBeInTheDocument();
  });
});
