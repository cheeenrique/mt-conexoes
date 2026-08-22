import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FichaAccess } from './ficha-access';

function setup(reveal = vi.fn().mockResolvedValue({ ok: true as const, value: 'senha-secreta' })) {
  render(
    <FichaAccess
      subscriptionId="sub-1"
      accessUsername="joao.silva"
      hasAccessPassword
      revealPassword={reveal}
    />,
  );
  return reveal;
}

describe('FichaAccess', () => {
  it('usuário e senha nascem mascarados — o login não fica em texto claro', () => {
    setup();
    expect(screen.queryByText('joao.silva')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••••')).toHaveLength(2);
  });

  it('o olho revela os dois campos de uma vez', async () => {
    const reveal = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Revelar acesso' }));

    expect(reveal).toHaveBeenCalledWith('sub-1');
    expect(await screen.findByText('joao.silva')).toBeInTheDocument();
    expect(screen.getByText('senha-secreta')).toBeInTheDocument();
  });

  it('avisa que a revelação foi registrada e mostra a contagem para esconder', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Revelar acesso' }));
    expect(await screen.findByText(/Este acesso foi registrado\. Esconde sozinho em/)).toBeInTheDocument();
    expect(screen.getByText('30s')).toBeInTheDocument();
  });

  it('esconder de volta tira a senha da tela', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Revelar acesso' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Esconder acesso' }));
    expect(screen.queryByText('senha-secreta')).not.toBeInTheDocument();
  });

  it('copiar só fica disponível com o valor revelado', async () => {
    setup();
    expect(screen.getByRole('button', { name: 'Copiar senha' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Revelar acesso' }));
    expect(await screen.findByRole('button', { name: 'Copiar senha' })).toBeEnabled();
  });

  it('assinatura sem senha guardada não oferece revelação', () => {
    render(
      <FichaAccess
        subscriptionId="sub-1"
        accessUsername="joao.silva"
        hasAccessPassword={false}
        revealPassword={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Revelar acesso' })).toBeDisabled();
    expect(screen.getByText('Nenhuma senha guardada para esta assinatura.')).toBeInTheDocument();
  });

  it('erro do servidor não deixa nada revelado', async () => {
    const reveal = vi.fn().mockResolvedValue({ error: { code: 'FORBIDDEN', message: 'Sem permissão.' } });
    render(
      <FichaAccess subscriptionId="sub-1" accessUsername="joao.silva" hasAccessPassword revealPassword={reveal} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Revelar acesso' }));
    expect(screen.queryByText('joao.silva')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••••')).toHaveLength(2);
  });
});
