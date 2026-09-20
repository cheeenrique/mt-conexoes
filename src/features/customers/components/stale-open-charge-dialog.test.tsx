import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StaleOpenChargeDialog } from './stale-open-charge-dialog';
import type { StaleOpenChargeDTO } from '../ficha-types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const STALE: StaleOpenChargeDTO = { chargeId: 'cobranca-1', fromCents: '9000', toCents: '3500' };

function renderDialog(overrides: Partial<Parameters<typeof StaleOpenChargeDialog>[0]> = {}) {
  const realignCharge = vi.fn().mockResolvedValue({ ok: true as const });
  const onClose = vi.fn();
  render(
    <StaleOpenChargeDialog
      stale={STALE}
      customerId="cliente-1"
      realignCharge={realignCharge}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { realignCharge, onClose };
}

describe('StaleOpenChargeDialog — cobrança que ficou no valor do plano anterior', () => {
  it('mostra o valor velho e o novo — o operador decide olhando os dois', () => {
    renderDialog();

    expect(screen.getByText(/R\$ 90,00/)).toBeTruthy();
    expect(screen.getByText(/R\$ 35,00/)).toBeTruthy();
  });

  it('sem cobrança para trás não abre nada', () => {
    renderDialog({ stale: null });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('confirmar realinha a cobrança e fecha', async () => {
    const user = userEvent.setup();
    const { realignCharge, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /atualizar cobrança/i }));

    await waitFor(() => expect(realignCharge).toHaveBeenCalledWith('cobranca-1', 'cliente-1'));
    expect(onClose).toHaveBeenCalled();
  });

  // Recusar é decisão legítima: reajuste que vale só do próximo ciclo deixa a
  // cobrança corrente como está. Não pode virar chamada silenciosa.
  it('"Deixar como está" fecha sem tocar na cobrança', async () => {
    const user = userEvent.setup();
    const { realignCharge, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /deixar como está/i }));

    expect(realignCharge).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
