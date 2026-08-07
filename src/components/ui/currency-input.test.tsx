import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyInput } from './currency-input';

describe('CurrencyInput', () => {
  it('exibe o valor formatado em reais a partir de centavos', () => {
    render(<CurrencyInput value="12345" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('R$ 123,45');
  });

  it('digitar dispara onValueChange em centavos, nunca number', async () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value="0" onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // "R$ 0,00" — seleciona o dígito inteiro inicial (índice 3) e substitui,
    // reproduzindo o padrão real de digitação num campo de valor: o usuário
    // seleciona o "0" de placeholder antes de digitar o valor.
    await userEvent.click(input);
    input.setSelectionRange(3, 4);
    await userEvent.keyboard('5');
    expect(onValueChange).toHaveBeenLastCalledWith('500');
  });
});
