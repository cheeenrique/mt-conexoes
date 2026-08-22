import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyInput } from './currency-input';

/**
 * ⚠️ O que este arquivo cobre é a **ligação** do componente: exibir centavos e
 * devolver centavos. A conversão em si é função pura e está testada onde mora
 * — `parseDecimalStringToCents` em `src/core/money.test.ts` e
 * `centsToDecimalString` em `src/lib/format.test.ts`, com os casos do bug de
 * 100x (0,50 · 0,01 · 33,33 · 1.234,56).
 *
 * A digitação de vírgula e ponto **não é testável aqui**: no jsdom, o
 * `userEvent` não entrega esses caracteres nem a um `<input>` comum, quanto
 * mais a um campo mascarado. Teste que simula isso passa a medir o jsdom em
 * vez do nosso código. Digitação real é verificação de navegador.
 */
describe('CurrencyInput', () => {
  it('exibe o valor formatado em reais a partir de centavos', () => {
    render(<CurrencyInput value="12345" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('R$ 123,45');
  });

  it('exibe 1 centavo sem virar 1 real', () => {
    render(<CurrencyInput value="1" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('R$ 0,01');
  });

  it('exibe zero', () => {
    render(<CurrencyInput value="0" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('R$ 0,00');
  });

  it('devolve centavos como string, nunca number', async () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value="0" onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;

    await userEvent.click(input);
    input.setSelectionRange(3, 4);
    await userEvent.keyboard('5');

    expect(onValueChange).toHaveBeenLastCalledWith('500');
    expect(typeof onValueChange.mock.lastCall?.[0]).toBe('string');
  });
});
