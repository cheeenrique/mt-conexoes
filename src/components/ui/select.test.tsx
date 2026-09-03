import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './select';

const OPTIONS = [
  { value: 'p1', label: 'Plano Mensal' },
  { value: 'p2', label: 'Plano Trimestral' },
];

describe('Select — valor controlado sem opção correspondente', () => {
  it('abrir o popup com value fora da lista não dispara onValueChange sozinho', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select aria-label="Plano" value="" onValueChange={onValueChange} options={OPTIONS} />);

    await user.click(screen.getByRole('combobox', { name: 'Plano' }));

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('digitar na busca sem achar nada não dispara onValueChange sozinho', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select aria-label="Plano" value="p1" onValueChange={onValueChange} options={OPTIONS} />);

    await user.click(screen.getByRole('combobox', { name: 'Plano' }));
    const search = await screen.findByPlaceholderText('Buscar...');
    search.focus();
    await user.keyboard('zzzzz não existe');

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('escolher uma opção de verdade continua funcionando', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select aria-label="Plano" value="p1" onValueChange={onValueChange} options={OPTIONS} />);

    await user.click(screen.getByRole('combobox', { name: 'Plano' }));
    await user.click(await screen.findByRole('option', { name: 'Plano Trimestral' }));

    expect(onValueChange).toHaveBeenCalledWith('p2');
  });

  it('com opção "Nenhum" (value vazio) na lista, o resync pra vazio é propagado normalmente', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const withEmpty = [{ value: '', label: 'Nenhum' }, ...OPTIONS];
    render(<Select aria-label="Plano" value="" onValueChange={onValueChange} options={withEmpty} />);

    await user.click(screen.getByRole('combobox', { name: 'Plano' }));
    await user.click(await screen.findByRole('option', { name: 'Plano Mensal' }));

    expect(onValueChange).toHaveBeenCalledWith('p1');
  });
});
