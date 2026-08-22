import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FichaSubscription } from './ficha-subscription';
import type { FichaSubscriptionDTO } from '../../ficha-types';

const TZ = 'America/Sao_Paulo';

function makeSubscription(overrides: Partial<FichaSubscriptionDTO> = {}): FichaSubscriptionDTO {
  return {
    id: 'sub-1',
    planId: 'plan-1',
    supplierId: 'supplier-1',
    planName: 'Pacote Família',
    supplierName: 'Tubarão',
    cycle: 'QUARTERLY',
    status: 'ACTIVE',
    priceCents: '12000',
    costCents: '3800',
    nextDueAt: '2026-09-05T23:59:59.999-03:00',
    screens: 2,
    accessUsername: 'joao.silva',
    hasAccessPassword: true,
    ...overrides,
  };
}

describe('FichaSubscription', () => {
  it('mostra os seis campos do handoff', () => {
    render(<FichaSubscription subscription={makeSubscription()} timezone={TZ} />);

    for (const label of ['Plano', 'Próximo vencimento', 'Telas', 'Paga por ciclo', 'Custo por ciclo', 'Margem']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Pacote Família')).toBeInTheDocument();
    expect(screen.getByText('Trimestral')).toBeInTheDocument();
    expect(screen.getByText('05/09/2026')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('R$ 120,00')).toBeInTheDocument();
    expect(screen.getByText('R$ 38,00')).toBeInTheDocument();
  });

  it('pinta a margem pela régua fixa — 68% é saudável', () => {
    render(<FichaSubscription subscription={makeSubscription()} timezone={TZ} />);
    expect(screen.getByText('68%').className).toContain('text-success');
  });

  it('margem apertada sai em âmbar', () => {
    render(<FichaSubscription subscription={makeSubscription({ costCents: '9000' })} timezone={TZ} />);
    expect(screen.getByText('25%').className).toContain('text-warning');
  });

  it('margem crítica sai em vermelho', () => {
    render(<FichaSubscription subscription={makeSubscription({ costCents: '11500' })} timezone={TZ} />);
    expect(screen.getByText('4%').className).toContain('text-danger');
  });

  it('cliente sem assinatura aponta para a ação, não some da tela', () => {
    render(<FichaSubscription subscription={null} timezone={TZ} />);
    expect(screen.getByText(/ainda não tem assinatura/)).toBeInTheDocument();
  });
});
