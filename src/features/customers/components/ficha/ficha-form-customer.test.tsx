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

describe('FichaFormCustomer — WhatsApp já cadastrado', () => {
  it('mostra um link pra ficha do cliente existente, não só um aviso de texto — é lá que se adiciona a 2ª assinatura', async () => {
    const user = userEvent.setup();
    const checkPhone = vi.fn().mockResolvedValue({ id: 'cliente-existente', name: 'Ana Souza' });
    render(<Harness checkPhone={checkPhone} />);

    const phoneField = screen.getByLabelText('WhatsApp');
    await user.type(phoneField, '62998133401');
    await user.tab();

    await waitFor(() => expect(checkPhone).toHaveBeenCalled());
    const link = await screen.findByRole('link', { name: /abrir a ficha de Ana Souza/i });
    expect(link).toHaveAttribute('href', '/customers/cliente-existente');
  });

  it('sem duplicidade, não mostra o aviso', () => {
    render(<Harness checkPhone={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /abrir a ficha/i })).not.toBeInTheDocument();
  });
});
