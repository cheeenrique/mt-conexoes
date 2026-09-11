import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargeRowActions } from './charge-row-actions';
import type { ChargeDTO } from '../queries';

const writeOffChargeAction = vi.fn();
const refresh = vi.fn();

vi.mock('../actions', () => ({ writeOffChargeAction: (...args: unknown[]) => writeOffChargeAction(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/toast', () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }));

const CHARGE: ChargeDTO = {
  id: 'charge-1',
  customerId: 'customer-1',
  customerName: 'Cliente Teste',
  customerPhone: null,
  supplierName: null,
  principalCents: '9000',
  discountCents: '0',
  netCents: '9000',
  paidCents: '3000',
  status: 'OVERDUE',
  dueAt: '2026-09-02T02:59:59.999Z',
  issuedAt: '2026-08-01T03:00:00.000Z',
  payments: [],
};

function setup(overrides: Partial<ChargeDTO> = {}) {
  render(<ChargeRowActions charge={{ ...CHARGE, ...overrides }} onRegisterPayment={vi.fn()} />);
}

const writeOffButton = () => screen.queryByRole('button', { name: 'Dar baixa no restante' });

beforeEach(() => {
  writeOffChargeAction.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});

/**
 * A baixa fecha a cobrança com o que já entrou e joga o resto para o desconto —
 * irreversível. O botão só aparece onde o caso existe: cobrança sem pagamento
 * se cancela (caminho com motivo obrigatório), cobrança quitada não tem resto.
 */
describe('ChargeRowActions — dar baixa no restante', () => {
  it('aparece na cobrança paga em parte', () => {
    setup();
    expect(writeOffButton()).toBeInTheDocument();
  });

  it('some na cobrança sem pagamento nenhum', () => {
    setup({ paidCents: '0' });
    expect(writeOffButton()).not.toBeInTheDocument();
  });

  it('some na cobrança já paga e na cancelada', () => {
    setup({ status: 'PAID', paidCents: '9000' });
    expect(writeOffButton()).not.toBeInTheDocument();
  });

  it('só chama a ação depois da confirmação, com o valor que falta na frente do operador', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(writeOffButton()!);
    expect(writeOffChargeAction).not.toHaveBeenCalled();
    expect(screen.getByText(/R\$ 60,00 que faltam viram desconto/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dar baixa' }));
    expect(writeOffChargeAction).toHaveBeenCalledWith('charge-1', 'customer-1');
  });
});
