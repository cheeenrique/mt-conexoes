import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChargeRowActions } from './charge-row-actions';
import type { ChargeDTO } from '../queries';

const writeOffChargeAction = vi.fn();
const cancelChargeAction = vi.fn();
const realignChargeAction = vi.fn();
const refresh = vi.fn();

vi.mock('../actions', () => ({
  writeOffChargeAction: (...args: unknown[]) => writeOffChargeAction(...args),
  cancelChargeAction: (...args: unknown[]) => cancelChargeAction(...args),
  realignChargeAction: (...args: unknown[]) => realignChargeAction(...args),
}));
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
  subscriptionPriceCents: '9000',
  subscriptionCostCents: '3000',
  payments: [],
};

function setup(overrides: Partial<ChargeDTO> = {}) {
  render(<ChargeRowActions charge={{ ...CHARGE, ...overrides }} onRegisterPayment={vi.fn()} />);
}

const writeOffButton = () => screen.queryByRole('button', { name: 'Dar baixa no restante' });

const cancelButton = () => screen.queryByRole('button', { name: 'Cancelar cobrança' });
const realignButton = () => screen.queryByRole('button', { name: 'Atualizar valor pelo plano' });

beforeEach(() => {
  writeOffChargeAction.mockReset().mockResolvedValue({ ok: true });
  cancelChargeAction.mockReset().mockResolvedValue({ ok: true });
  realignChargeAction.mockReset().mockResolvedValue({ ok: true });
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


/**
 * Cancelar existia no servidor desde a Etapa 2 e nunca teve botão. É a saída
 * para cobrança que não devia existir — e só para essa: com dinheiro
 * registrado, cancelar sumiria com o pagamento da conta, e o caminho é a baixa.
 */
describe('ChargeRowActions — cancelar cobrança', () => {
  it('some na cobrança que já tem pagamento — ali o caminho é a baixa', () => {
    setup();
    expect(cancelButton()).not.toBeInTheDocument();
  });

  it('aparece na cobrança em aberto sem pagamento', () => {
    setup({ paidCents: '0' });
    expect(cancelButton()).toBeInTheDocument();
  });

  it('exige motivo antes de liberar a confirmação', async () => {
    const user = userEvent.setup();
    setup({ paidCents: '0' });

    await user.click(cancelButton()!);
    const confirm = screen.getByRole('button', { name: 'Cancelar cobrança', hidden: false });
    expect(screen.getByPlaceholderText('Cliente desistiu do plano')).toBeInTheDocument();
    expect(confirm).toBeDisabled();

    await user.type(screen.getByPlaceholderText('Cliente desistiu do plano'), 'cliente desistiu');
    await user.click(screen.getByRole('button', { name: 'Cancelar cobrança', hidden: false }));
    expect(cancelChargeAction).toHaveBeenCalledWith('charge-1', 'customer-1', { reason: 'cliente desistiu' });
  });
});

/**
 * O valor da cobrança é congelado na emissão. Divergir do plano de hoje é o
 * sinal de "troquei o plano e a cobrança ficou com o valor velho" — e é essa
 * cobrança que a régua manda por WhatsApp.
 */
describe('ChargeRowActions — atualizar valor pelo plano', () => {
  it('some quando cobrança e plano estão no mesmo valor', () => {
    setup({ paidCents: '0', principalCents: '9000', subscriptionPriceCents: '9000' });
    expect(realignButton()).not.toBeInTheDocument();
  });

  it('aparece quando o plano mudou de valor e a cobrança não acompanhou', async () => {
    const user = userEvent.setup();
    setup({ paidCents: '0', principalCents: '9000', subscriptionPriceCents: '3000' });

    await user.click(realignButton()!);
    expect(screen.getByText(/de R\$ 90,00 para R\$ 30,00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Atualizar valor' }));
    expect(realignChargeAction).toHaveBeenCalledWith('charge-1', 'customer-1');
  });

  it('some na cobrança com pagamento — reescrever documento com dinheiro é proibido', () => {
    setup({ paidCents: '3000', principalCents: '9000', subscriptionPriceCents: '3000' });
    expect(realignButton()).not.toBeInTheDocument();
  });
});
