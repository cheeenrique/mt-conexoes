import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportCustomersDialog } from './import-customers-dialog';

const RESUMO = {
  totalRows: 28,
  imported: [{ status: 'imported' as const, identifier: 'Adriana Prado', priceCents: '10500' }],
  skipped: [],
  rejected: [],
  importedTotalCents: '214000',
};

function setup() {
  const importCustomers = vi.fn().mockResolvedValue({ ok: true as const, summary: RESUMO });
  render(
    <ImportCustomersDialog
      suppliers={[{ id: 'forn-1', name: 'Star Play Servidor' }]}
      importCustomers={importCustomers}
    />,
  );
  return importCustomers;
}

const abrir = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: /importar planilha/i }));

/**
 * Bug encontrado no navegador em 25/08/2026: o diálogo reabria mostrando o
 * resultado da importação anterior. Havia `resetForm()`, mas só no
 * `onOpenChange` — os botões "Cancelar" e "Fechar" chamavam `setOpen(false)`
 * direto e pulavam a limpeza. Quarta vez que esta família de bug aparece no
 * repositório (ver 103e83d, `StepAxis` e `NewLeadButton`).
 */
describe('ImportCustomersDialog — não guarda estado entre aberturas', () => {
  it('fechar pelo botão Cancelar limpa o fornecedor escolhido', async () => {
    const user = userEvent.setup();
    setup();

    await abrir(user);
    const gatilho = screen.getByRole('combobox', { name: /fornecedor/i });
    gatilho.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(gatilho).toHaveTextContent('Star Play Servidor');

    await user.click(screen.getByRole('button', { name: /cancelar/i }));
    await abrir(user);

    expect(screen.getByRole('combobox', { name: /fornecedor/i })).toHaveTextContent('Selecionar fornecedor');
  });

  it('fechar pelo Esc também limpa — o caminho que já funcionava não pode regredir', async () => {
    const user = userEvent.setup();
    setup();

    await abrir(user);
    const gatilho = screen.getByRole('combobox', { name: /fornecedor/i });
    gatilho.focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowDown}{Enter}');
    await user.keyboard('{Escape}');
    await abrir(user);

    expect(screen.getByRole('combobox', { name: /fornecedor/i })).toHaveTextContent('Selecionar fornecedor');
  });

  it('o botão Importar nasce desabilitado sem fornecedor e sem arquivo', async () => {
    const user = userEvent.setup();
    setup();

    await abrir(user);
    expect(screen.getByRole('button', { name: /^importar$/i })).toBeDisabled();
  });
});
