import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewLeadButton } from './new-lead-button';

vi.mock('../actions', () => ({
  createLeadAction: vi.fn().mockResolvedValue({ ok: true }),
}));

/**
 * Bug já corrigido duas vezes neste repo (diálogo de pagamento, 103e83d, e a
 * gaveta de passo da régua): o conteúdo da gaveta segue montado durante a
 * animação de fechamento, então um formulário que não remonta guarda o
 * rascunho da abertura anterior.
 */
describe('NewLeadButton — a gaveta não guarda estado entre aberturas', () => {
  it('abrir, digitar, fechar sem salvar e reabrir devolve os campos vazios', async () => {
    const user = userEvent.setup();
    render(<NewLeadButton />);

    await user.click(screen.getByRole('button', { name: 'Novo lead' }));
    await user.type(screen.getByLabelText('Nome'), 'Rascunho descartado');
    await user.type(screen.getByLabelText('Interesse'), 'Trimestral');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Novo lead' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('');
    expect(screen.getByLabelText('Interesse')).toHaveValue('');
  });

  it('a origem volta ao padrão "Indicação" na reabertura, mesmo depois de editada', async () => {
    const user = userEvent.setup();
    render(<NewLeadButton />);

    await user.click(screen.getByRole('button', { name: 'Novo lead' }));
    const origem = screen.getByLabelText('Origem');
    await user.clear(origem);
    await user.type(origem, 'Grupo de WhatsApp');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Novo lead' }));
    expect(screen.getByLabelText('Origem')).toHaveValue('Indicação');
  });
});
