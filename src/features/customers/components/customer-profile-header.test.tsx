import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CustomerProfileHeader } from './customer-profile-header';
import type { CustomerPnlDTO } from '@/features/reports/queries';

function makePnl(overrides: Partial<CustomerPnlDTO> = {}): CustomerPnlDTO {
  return {
    billedCents: '264000', receivedCents: '258000', costCents: '68000',
    chargesCount: 46, paidCount: 44, overdueCount: 2, openCount: 0,
    ...overrides,
  };
}

describe('CustomerProfileHeader', () => {
  it('label é "Lucro bruto", nunca "Lucro" puro', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl()} />);
    expect(screen.getByText('Lucro bruto')).toBeInTheDocument();
    expect(screen.queryByText(/^Lucro$/)).not.toBeInTheDocument();
  });

  it('mostra margem calculada', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl()} />);
    // (264000-68000)/264000 = 74.24...% → toFixed(0) = 74%
    expect(screen.getByText(/margem 74%/)).toBeInTheDocument();
  });

  it('sem cobrança: margem mostra travessão, sem Renovações/Histórico', () => {
    render(<CustomerProfileHeader name="João" supplierName={null} since="—" active={false} pnl={makePnl({
      billedCents: '0', receivedCents: '0', costCents: '0', chargesCount: 0, paidCount: 0, overdueCount: 0, openCount: 0,
    })} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/Renovações/)).not.toBeInTheDocument();
  });

  it('pluraliza atraso no singular', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl({ overdueCount: 1 })} />);
    expect(screen.getByText(/1 atraso ·/)).toBeInTheDocument();
  });

  it('pluraliza atrasos no plural', () => {
    render(<CustomerProfileHeader name="João" supplierName="Tubarão" since="03/2021" active pnl={makePnl({ overdueCount: 2 })} />);
    expect(screen.getByText(/2 atrasos ·/)).toBeInTheDocument();
  });
});
