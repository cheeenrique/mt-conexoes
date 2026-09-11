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
  subscriptionPriceCents: '10000',
  subscriptionCostCents: '3000',
  subscriptionCycle: 'MONTHLY',
  payments: [],
};

function renderDialog() {
  return render(<RegisterPaymentDialog charge={charge} open onOpenChange={() => {}} timezone={TZ} />);
}

function dateField(): HTMLElement {
  return screen.getByLabelText('Data');
}

function nextDueField(): HTMLElement {
  return screen.getByLabelText('Próximo vencimento');
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

  /**
   * Regra do operador (11/09/2026): âncora na data mais tarde entre o
   * vencimento em aberto e o pagamento. O campo vem preenchido por ela e aceita
   * outra data — prazo combinado caso a caso é decisão dele, não do cálculo.
   */
  it('o próximo vencimento vem preenchido pela regra e é enviado sem o operador tocar nele', async () => {
    const user = userEvent.setup();
    renderDialog();

    // O valor exato tem teste próprio, com vencimento e pagamento fixos
    // (`next-due-preview.test.ts`). Aqui o que importa é a fiação: sem tocar no
    // campo, sai a data da regra — e ela é sempre depois do vencimento quitado.
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    const sent = registerPaymentAction.mock.calls[0][2].nextDueAt;
    expect(sent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(sent > charge.dueAt.slice(0, 10)).toBe(true);
  });

  it('o operador troca o vencimento e a escolha dele é a que vai', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(nextDueField());
    await user.type(nextDueField(), '20112026');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ nextDueAt: '2026-11-20' });
  });

  it('avisa quando o vencimento escolhido já nasce vencido', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.clear(nextDueField());
    await user.type(nextDueField(), '10082020');

    expect(await screen.findByText(/Já vencido há/)).toBeInTheDocument();
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
