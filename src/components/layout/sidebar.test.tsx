import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

function setup(paused: boolean) {
  const onTogglePause = vi.fn();
  render(
    <Sidebar paused={paused} onTogglePause={onTogglePause} mobileOpen={false} onMobileOpenChange={() => {}} />,
  );
  return { onTogglePause };
}

/**
 * Kill switch (T8): pausar pede confirmação (pedido explícito depois do relato
 * de clique sem querer); retomar continua de um clique só — "efeito imediato"
 * do T8 vale a partir da confirmação, não é a confirmação que o T8 proíbe.
 */
describe('Sidebar — kill switch', () => {
  it('pausar abre confirmação antes de chamar onTogglePause', async () => {
    const user = userEvent.setup();
    const { onTogglePause } = setup(false);

    await user.click(screen.getByRole('button', { name: 'Pausar envios' }));
    expect(onTogglePause).not.toHaveBeenCalled();
    expect(screen.getByText('Pausar os envios?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pausar envios' }));
    expect(onTogglePause).toHaveBeenCalledOnce();
  });

  it('cancelar a confirmação não chama onTogglePause', async () => {
    const user = userEvent.setup();
    const { onTogglePause } = setup(false);

    await user.click(screen.getByRole('button', { name: 'Pausar envios' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onTogglePause).not.toHaveBeenCalled();
    expect(screen.queryByText('Pausar os envios?')).not.toBeInTheDocument();
  });

  it('retomar chama onTogglePause direto, sem confirmação', async () => {
    const user = userEvent.setup();
    const { onTogglePause } = setup(true);

    await user.click(screen.getByRole('button', { name: 'Envios pausados, retomar' }));

    expect(onTogglePause).toHaveBeenCalledOnce();
    expect(screen.queryByText('Pausar os envios?')).not.toBeInTheDocument();
  });
});
