import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterPaymentDialog } from './register-payment-dialog';
import type { ChargeDTO } from '../queries';

const registerPaymentAction = vi.fn();

vi.mock('../actions', () => ({ registerPaymentAction: (...args: unknown[]) => registerPaymentAction(...args) }));
vi.mock('@/lib/toast', () => ({ toastError: vi.fn() }));

const TZ = 'America/Sao_Paulo';

const charge: ChargeDTO = {
  id: 'charge-1',
  customerId: 'customer-1',
  customerName: 'Cliente Teste',
  customerPhone: null,
  supplierName: null,
  principalCents: '10000',
  discountCents: '0',
  netCents: '10000',
  paidCents: '0',
  status: 'OVERDUE',
  dueAt: '2026-09-02T02:59:59.999Z',
  issuedAt: '2026-08-01T03:00:00.000Z',
  payments: [],
};

function renderDialog() {
  return render(<RegisterPaymentDialog charge={charge} open onOpenChange={() => {}} timezone={TZ} />);
}

function dateField(): HTMLElement {
  return screen.getByLabelText('Data');
}

beforeEach(() => {
  registerPaymentAction.mockReset();
  registerPaymentAction.mockResolvedValue({ ok: true });
});

describe('RegisterPaymentDialog', () => {
  it('o operador troca a data para o dia em que o cliente pagou', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(dateField());
    await user.type(dateField(), '01092026');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction).toHaveBeenCalledTimes(1);
    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ paidAt: '2026-09-01' });
  });

  it('data no futuro não é enviada e o erro aparece no campo', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(dateField());
    await user.type(dateField(), '01012099');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('A data do pagamento não pode ser no futuro.')).toBeInTheDocument();
    expect(registerPaymentAction).not.toHaveBeenCalled();
  });

  it('data que não existe no calendário é recusada antes do envio', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(dateField());
    await user.type(dateField(), '31022026');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('Data do pagamento inválida.')).toBeInTheDocument();
    expect(registerPaymentAction).not.toHaveBeenCalled();
  });
});
