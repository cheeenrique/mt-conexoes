import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneInput } from './phone-input';

describe('PhoneInput', () => {
  it('exibe o telefone formatado a partir de E.164', () => {
    render(<PhoneInput value="+5511999998888" onValueChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('(11) 99999-8888');
  });

  it('digitar dispara onValueChange em E.164', async () => {
    const onValueChange = vi.fn();
    render(<PhoneInput value="" onValueChange={onValueChange} />);
    await userEvent.type(screen.getByRole('textbox'), '11999998888');
    expect(onValueChange).toHaveBeenLastCalledWith('+5511999998888');
  });
});
