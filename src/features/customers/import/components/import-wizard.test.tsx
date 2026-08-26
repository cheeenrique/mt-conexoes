import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportWizard } from './import-wizard';

const PLAN = {
  totalRows: 1,
  toImport: [
    {
      identifier: 'Adriana Prado',
      username: 'adriana.prado',
      priceCents: '10500',
      costCents: '5000',
      marginPercent: '52,4',
      dueAt: '2026-09-05T02:59:59.999Z',
      hasPhoneWarning: false,
    },
  ],
  alreadyExistsCount: 0,
  rejected: [],
  importTotalCents: '10500',
  averageMarginPercent: '52,4',
};

function buildFile(name = 'planilha.xlsx') {
  return new File(['conteúdo'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function setup() {
  const previewImport = vi.fn().mockResolvedValue({ ok: true as const, fileName: 'planilha.xlsx', plan: PLAN });
  const confirmImport = vi.fn();
  render(
    <ImportWizard
      suppliers={[{ id: 'forn-1', name: 'Star Play Servidor' }]}
      timezone="America/Sao_Paulo"
      previewImport={previewImport}
      confirmImport={confirmImport}
    />,
  );
  return { previewImport, confirmImport };
}

async function chooseSupplierAndFile(user: ReturnType<typeof userEvent.setup>, fileName?: string) {
  const gatilho = screen.getByRole('combobox', { name: /fornecedor/i });
  gatilho.focus();
  await user.keyboard('{Enter}');
  await user.keyboard('{ArrowDown}{Enter}');

  const fileInput = document.getElementById('import-file') as HTMLInputElement;
  await user.upload(fileInput, buildFile(fileName));
}

describe('ImportWizard — "Voltar" não perde a escolha', () => {
  it('mantém fornecedor e arquivo selecionados ao voltar da prévia para a Etapa 1', async () => {
    const user = userEvent.setup();
    setup();

    await chooseSupplierAndFile(user);
    await user.click(screen.getByRole('button', { name: /conferir/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /voltar/i })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /voltar/i }));

    expect(screen.getByRole('combobox', { name: /fornecedor/i })).toHaveTextContent('Star Play Servidor');
    expect(screen.getByText('Arquivo selecionado: planilha.xlsx')).toBeInTheDocument();
  });

  it('o botão Conferir nasce desabilitado sem fornecedor e sem arquivo', () => {
    setup();
    expect(screen.getByRole('button', { name: /conferir/i })).toBeDisabled();
  });

  it('a prévia não escreve — só chama a função de prévia, nunca a de confirmação', async () => {
    const user = userEvent.setup();
    const { previewImport, confirmImport } = setup();

    await chooseSupplierAndFile(user);
    await user.click(screen.getByRole('button', { name: /conferir/i }));

    await waitFor(() => expect(previewImport).toHaveBeenCalledTimes(1));
    expect(confirmImport).not.toHaveBeenCalled();
  });
});
