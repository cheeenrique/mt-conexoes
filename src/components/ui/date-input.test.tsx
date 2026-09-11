import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DateInput } from './date-input';

/** Espelha o uso real (Controller do react-hook-form): `value` some do controle do pai. */
function ControlledDateInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateInput value={value} onValueChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('DateInput', () => {
  it('exibe a data salva em dd/mm/aaaa', () => {
    render(<ControlledDateInput initial="2026-09-10" />);
    expect(screen.getByRole('textbox')).toHaveValue('10/09/2026');
  });

  it('digitar a data completa devolve ISO para o formulário', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput />);

    await user.type(screen.getByRole('textbox'), '10092026');

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-10');
  });

  it('esvaziar o campo zera o valor em vez de manter a data anterior', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput initial="2026-09-10" />);

    await user.clear(screen.getByRole('textbox'));

    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
  });
});
