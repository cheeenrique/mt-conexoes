import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PhoneInput } from './phone-input';

/** Espelha o uso real (Controller do react-hook-form): `value` some do controle do pai. */
function ControlledPhoneInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneInput value={value} onValueChange={setValue} />
      <output data-testid="value">{value}</output>
    </>
  );
}

describe('PhoneInput', () => {
  it('nasce no modo Brasil (máscara de DDD)', () => {
    render(<ControlledPhoneInput />);
    expect(screen.getByRole('button', { name: 'Cliente de outro país' })).toBeInTheDocument();
  });

  it('exibe o telefone formatado a partir de E.164 no modo Brasil', () => {
    render(<ControlledPhoneInput initial="+5511999998888" />);
    expect(screen.getByRole('textbox')).toHaveValue('(11) 99999-8888');
  });

  it('digitar DDD + número no modo Brasil produz E.164 com +55', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);

    await user.type(screen.getByRole('textbox'), '62998133401');

    expect(screen.getByTestId('value')).toHaveTextContent('+5562998133401');
  });

  it('valor já salvo de outro país abre direto no modo internacional', () => {
    render(<ControlledPhoneInput initial="+13055551234" />);
    expect(screen.getByRole('button', { name: 'Usar formato brasileiro' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('+13055551234');
  });

  it('"Cliente de outro país" troca pro campo livre e guarda o número completo digitado', async () => {
    const user = userEvent.setup();
    render(<ControlledPhoneInput />);

    await user.click(screen.getByRole('button', { name: 'Cliente de outro país' }));
    expect(screen.getByRole('button', { name: 'Usar formato brasileiro' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox'), '+13055551234');

    expect(screen.getByTestId('value')).toHaveTextContent('+13055551234');
  });
});
