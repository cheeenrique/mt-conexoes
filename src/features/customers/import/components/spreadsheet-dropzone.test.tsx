import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpreadsheetDropzone } from './spreadsheet-dropzone';

const planilha = () => new File(['x'], 'planilha-uniplay.xlsm', { type: 'application/vnd.ms-excel.sheet.macroEnabled.12' });

function setup(file: File | null = null) {
  const onFileChange = vi.fn();
  const { rerender } = render(<SpreadsheetDropzone id="dz" file={file} onFileChange={onFileChange} />);
  return { onFileChange, rerender };
}

const zona = () => screen.getByText(/arraste a planilha aqui|solte a planilha aqui/i).closest('div')!;

describe('SpreadsheetDropzone', () => {
  it('aceita planilha arrastada — `accept` do input não vale para drop', () => {
    const { onFileChange } = setup();
    const arquivo = planilha();

    fireEvent.drop(zona(), { dataTransfer: { files: [arquivo] } });

    expect(onFileChange).toHaveBeenCalledWith(arquivo);
  });

  it('recusa arquivo que não é planilha, nomeando o arquivo e o que aceita', () => {
    const { onFileChange } = setup();

    fireEvent.drop(zona(), { dataTransfer: { files: [new File(['x'], 'contrato.pdf')] } });

    expect(onFileChange).not.toHaveBeenCalled();
    expect(screen.getByText(/"contrato\.pdf" não é planilha/i)).toBeInTheDocument();
    expect(screen.getByText(/\.xlsx ou \.xlsm/i)).toBeInTheDocument();
  });

  it('aceita pelo seletor de arquivo, que é o caminho do teclado', async () => {
    const user = userEvent.setup();
    const { onFileChange } = setup();
    const arquivo = planilha();

    await user.upload(screen.getByLabelText(/arraste a planilha aqui/i, { selector: 'input' }), arquivo);

    expect(onFileChange).toHaveBeenCalledWith(arquivo);
  });

  it('mostra nome e tamanho depois de escolher', () => {
    setup(planilha());

    expect(screen.getByText('planilha-uniplay.xlsm')).toBeInTheDocument();
    expect(screen.getByText(/pronto para conferir/i)).toBeInTheDocument();
  });

  it('remover devolve null e zera o input, para o mesmo arquivo poder ser escolhido de novo', async () => {
    const user = userEvent.setup();
    const arquivo = planilha();
    const { onFileChange } = setup(arquivo);

    const input = document.querySelector<HTMLInputElement>('#dz')!;
    await user.click(screen.getByRole('button', { name: /remover planilha-uniplay\.xlsm/i }));

    expect(onFileChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe('');
  });

  it('o input continua no DOM e focável — é o que dá teclado e leitor de tela', () => {
    setup();
    const input = document.querySelector<HTMLInputElement>('#dz')!;

    // `sr-only` esconde sem tirar do fluxo de foco; `display:none` tiraria.
    expect(input).toBeInTheDocument();
    expect(input.className).toContain('sr-only');
    expect(input).toHaveAttribute('aria-describedby', 'dz-ajuda');
  });
});
