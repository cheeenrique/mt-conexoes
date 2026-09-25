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
  subscriptionNetCents: '10000',
  subscriptionCycle: 'MONTHLY',
  payments: [],
};

function renderDialog(target: ChargeDTO = charge) {
  return render(<RegisterPaymentDialog charge={target} open onOpenChange={() => {}} timezone={TZ} />);
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

/**
 * Relatado em 25/09/2026: o cliente mensal de R$ 35,00 virou trimestral de
 * R$ 75,00, e a cobrança em aberto ficou com o valor do mensal. O diálogo
 * preenchia R$ 35,00 e recusava os R$ 75,00 que o cliente pagou. Nenhuma das
 * duas leituras é óbvia — reajuste combinado para o próximo ciclo também deixa
 * a cobrança com o valor anterior —, então o diálogo pergunta e não escolhe.
 */
describe('RegisterPaymentDialog — cobrança com valor de um plano anterior', () => {
  const staleCharge: ChargeDTO = {
    ...charge,
    principalCents: '3500',
    netCents: '3500',
    subscriptionPriceCents: '7500',
    subscriptionNetCents: '7500',
    subscriptionCycle: 'QUARTERLY',
  };

  function amountField(): HTMLElement {
    return screen.getByLabelText('Valor');
  }

  it('mostra as duas opções, sem nenhuma marcada', () => {
    renderDialog(staleCharge);

    const current = screen.getByRole('radio', { name: /Valor desta cobrança.*R\$ 35,00/ });
    const plan = screen.getByRole('radio', { name: /Valor do plano atual.*R\$ 75,00.*Trimestral/ });
    expect(current).not.toBeChecked();
    expect(plan).not.toBeChecked();
  });

  it('enviar sem escolher mostra o erro e não registra nada', async () => {
    const user = userEvent.setup();
    renderDialog(staleCharge);

    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(await screen.findByText('Escolha qual valor vale para esta cobrança.')).toBeInTheDocument();
    expect(registerPaymentAction).not.toHaveBeenCalled();
  });

  it('escolher o plano atual preenche R$ 75,00 e pede o realinhamento', async () => {
    const user = userEvent.setup();
    renderDialog(staleCharge);

    await user.click(screen.getByRole('radio', { name: /Valor do plano atual/ }));
    expect(amountField()).toHaveValue('R$ 75,00');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction).toHaveBeenCalledTimes(1);
    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ amountCents: '7500', realignToSubscription: true });
  });

  it('com desconto vigente, o plano atual preenche o preço menos o desconto', async () => {
    const user = userEvent.setup();
    renderDialog({ ...staleCharge, subscriptionNetCents: '6750' });

    await user.click(screen.getByRole('radio', { name: /Valor do plano atual.*R\$ 67,50/ }));
    expect(amountField()).toHaveValue('R$ 67,50');
  });

  it('escolher o valor da cobrança preenche R$ 35,00 e não realinha', async () => {
    const user = userEvent.setup();
    renderDialog(staleCharge);

    await user.click(screen.getByRole('radio', { name: /Valor desta cobrança/ }));
    expect(amountField()).toHaveValue('R$ 35,00');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ amountCents: '3500', realignToSubscription: false });
  });

  it('o valor escolhido continua editável para pagamento parcial', async () => {
    const user = userEvent.setup();
    renderDialog(staleCharge);

    await user.click(screen.getByRole('radio', { name: /Valor do plano atual/ }));
    await user.clear(amountField());
    await user.type(amountField(), '4000');
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ amountCents: '4000', realignToSubscription: true });
  });

  // Aceitar os R$ 35,00 abre o próximo ciclo com o ciclo do plano de hoje — três
  // meses de acesso pelo preço do mensal, se o operador não perceber.
  it('avisa que o próximo vencimento conta o ciclo do plano atual', () => {
    renderDialog(staleCharge);

    expect(screen.getByText(/ciclo trimestral, o do plano atual/)).toBeInTheDocument();
  });

  it('cobrança com o valor do plano não pergunta nada', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryByText(/o do plano atual/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pagamento' }));

    expect(registerPaymentAction.mock.calls[0][2]).toMatchObject({ amountCents: '10000' });
    expect(registerPaymentAction.mock.calls[0][2]).not.toHaveProperty('realignToSubscription');
  });
});
