import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyInput } from './currency-input';

/**
 * ⚠️ Este arquivo existe porque a versão anterior do campo — `IMaskInput`
 * controlado — **perdia dígito**: digitar 1, 2, 3, 4 parava em `R$ 1,00`, e o
 * resultado variava entre passadas. O valor voltava do estado do pai num
 * formato diferente do que a máscara mostrava, a máscara reescrevia o campo, o
 * cursor ia para o fim e o dígito seguinte caía depois da vírgula, onde a
 * escala de 2 casas o descartava. Digitar R$ 12,34 era impossível.
 *
 * Agora o campo é um acumulador de centavos sobre um `<input>` comum: o que
 * está na tela são os dígitos digitados, e a digitação é testável aqui — foi
 * justamente o que a versão antiga só conseguia verificar no navegador.
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

  it('digitar 1234 num campo vazio dá R$ 12,34 — nenhum dígito se perde', async () => {
    function Controlado() {
      const [cents, setCents] = useState('0');
      return <CurrencyInput value={cents} onValueChange={setCents} />;
    }
    render(<Controlado />);
    const input = screen.getByRole('textbox');

    await userEvent.click(input);
    await userEvent.keyboard('1234');

    expect(input).toHaveValue('R$ 12,34');
  });

  it('apagar volta um dígito de cada vez', async () => {
    function Controlado() {
      const [cents, setCents] = useState('1234');
      return <CurrencyInput value={cents} onValueChange={setCents} />;
    }
    render(<Controlado />);
    const input = screen.getByRole('textbox');

    await userEvent.click(input);
    await userEvent.keyboard('{Backspace}');

    expect(input).toHaveValue('R$ 1,23');
  });

  it('devolve centavos como string, nunca number', async () => {
    const onValueChange = vi.fn();
    render(<CurrencyInput value="0" onValueChange={onValueChange} />);

    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.keyboard('5');

    expect(onValueChange).toHaveBeenLastCalledWith('5');
    expect(typeof onValueChange.mock.lastCall?.[0]).toBe('string');
  });
});
