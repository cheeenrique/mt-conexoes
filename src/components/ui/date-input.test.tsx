import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DateInput } from './date-input';

/** Espelha o uso real (Controller do react-hook-form): `value` some do controle do pai. */
function ControlledDateInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  const [changes, setChanges] = useState(0);
  return (
    <>
      <DateInput
        value={value}
        onValueChange={(next) => {
          setChanges((n) => n + 1);
          setValue(next);
        }}
      />
      <output data-testid="value">{value}</output>
      <output data-testid="changes">{changes}</output>
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

  /**
   * A máscara dispara `onAccept('')` sozinha ao montar com o campo vazio. Isso
   * chegava ao pai como "o operador apagou o campo" — e o diálogo de pagamento,
   * que usa esse sinal para parar de sugerir o próximo vencimento, nascia
   * achando que ele já tinha escolhido uma data (em branco).
   */
  it('montar vazio não avisa o pai de mudança nenhuma', () => {
    render(<ControlledDateInput />);
    expect(screen.getByTestId('changes')).toHaveTextContent('0');
  });

  it('montar preenchido também não avisa mudança', () => {
    render(<ControlledDateInput initial="2026-09-10" />);
    expect(screen.getByTestId('changes')).toHaveTextContent('0');
  });

  it('esvaziar o campo zera o valor em vez de manter a data anterior', async () => {
    const user = userEvent.setup();
    render(<ControlledDateInput initial="2026-09-10" />);

    await user.clear(screen.getByRole('textbox'));

    expect(screen.getByTestId('value')).toBeEmptyDOMElement();
  });
});
