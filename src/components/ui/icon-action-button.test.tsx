import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IconActionButton } from './icon-action-button';

// Posição, seta e atraso do tooltip dependem de layout real (floating-ui) e não
// são confiáveis em jsdom — cobertos manualmente no navegador. Aqui fica só o
// que é garantido em qualquer ambiente: nome acessível e o caso desabilitado.
function renderWithProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('IconActionButton', () => {
  it('variante onClick expõe o botão pelo aria-label e dispara a ação', async () => {
    const onClick = vi.fn();
    renderWithProvider(<IconActionButton icon={Pencil} label="Editar cliente" onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'Editar cliente' });
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('variante href renderiza um link externo com o mesmo aria-label', () => {
    renderWithProvider(<IconActionButton icon={Pencil} label="Abrir WhatsApp" href="https://wa.me/551199999999" />);

    const link = screen.getByRole('link', { name: 'Abrir WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/551199999999');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('variante disabled usa aria-disabled, nunca o atributo disabled nativo', () => {
    renderWithProvider(
      <IconActionButton
        icon={Pencil}
        label="Registrar pagamento"
        disabled
        disabledReason="Cobrança já paga"
      />,
    );

    const button = screen.getByRole('button', { name: 'Cobrança já paga' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Atributo `disabled` de verdade suprime hover/focus em vários navegadores
    // — o tooltip nunca apareceria. `aria-disabled` mantém o elemento operável
    // a nível de evento, só sinaliza o estado.
    expect(button).not.toBeDisabled();
  });

  it('variante disabled sem disabledReason repete o label no tooltip', () => {
    renderWithProvider(<IconActionButton icon={Pencil} label="Registrar pagamento" disabled />);

    expect(screen.getByRole('button', { name: 'Registrar pagamento' })).toBeInTheDocument();
  });
});
