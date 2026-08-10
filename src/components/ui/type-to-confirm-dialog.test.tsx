import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TypeToConfirmDialog } from './type-to-confirm-dialog';

describe('TypeToConfirmDialog', () => {
  it('botão de confirmar começa desabilitado e só habilita com o número exato', async () => {
    const onConfirm = vi.fn();
    render(
      <TypeToConfirmDialog
        open
        onOpenChange={() => {}}
        title="Enviar mensagens"
        description="Confirme digitando o número de destinatários."
        expectedValue={142}
        confirmLabel="Enviar"
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: 'Enviar' });
    expect(confirmButton).toBeDisabled();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, '14');
    expect(confirmButton).toBeDisabled();

    await userEvent.type(input, '2');
    expect(confirmButton).not.toBeDisabled();

    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
