import { useForm } from 'react-hook-form';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FichaFormCustomer } from './ficha-form-customer';
import type { CustomerFichaFormInput } from '../../ficha-schema';
import type { FindCustomerByPhone } from '../../ficha-types';

function Harness({ checkPhone }: { checkPhone: FindCustomerByPhone }) {
  const { register, control, formState } = useForm<CustomerFichaFormInput>({
    defaultValues: { name: '', phone: '', email: '', document: '', notes: '' } as CustomerFichaFormInput,
  });
  return <FichaFormCustomer register={register} control={control} errors={formState.errors} checkPhone={checkPhone} />;
}

// `Button` renderizado como `<a>` (via `render={<Link .../>}`) fica com
// `role="button"` — o mesmo padrão já usado em "Importar planilha" na tela de
// Clientes. Semanticamente é um botão que navega, não um link puro.
describe('FichaFormCustomer — WhatsApp já cadastrado', () => {
  it('mostra um botão pra ficha do cliente existente, não só um aviso de texto — é lá que se adiciona a 2ª assinatura', async () => {
    const user = userEvent.setup();
    const checkPhone = vi.fn().mockResolvedValue({ id: 'cliente-existente', name: 'Ana Souza' });
    render(<Harness checkPhone={checkPhone} />);

    const phoneField = screen.getByLabelText('WhatsApp');
    await user.type(phoneField, '62998133401');
    await user.tab();

    await waitFor(() => expect(checkPhone).toHaveBeenCalled());
    const goToExisting = await screen.findByRole('button', { name: /ver ficha de ana souza/i });
    expect(goToExisting).toHaveAttribute('href', '/customers/cliente-existente');
  });

  it('"Cadastrar mesmo assim" dispensa o aviso sem navegar', async () => {
    const user = userEvent.setup();
    const checkPhone = vi.fn().mockResolvedValue({ id: 'cliente-existente', name: 'Ana Souza' });
    render(<Harness checkPhone={checkPhone} />);

    await user.type(screen.getByLabelText('WhatsApp'), '62998133401');
    await user.tab();
    await screen.findByRole('button', { name: /ver ficha de ana souza/i });

    await user.click(screen.getByRole('button', { name: 'Cadastrar mesmo assim' }));

    expect(screen.queryByRole('button', { name: /ver ficha/i })).not.toBeInTheDocument();
  });

  it('sem duplicidade, não mostra o aviso', () => {
    render(<Harness checkPhone={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /ver ficha/i })).not.toBeInTheDocument();
  });
});
