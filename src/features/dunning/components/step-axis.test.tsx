import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StepAxis } from './step-axis';
import type { DunningStepDTO } from '../queries';

vi.mock('../actions', () => ({
  createDunningStepAction: vi.fn().mockResolvedValue({ id: 'novo' }),
  updateDunningStepAction: vi.fn().mockResolvedValue({ id: 'passo-1' }),
  deleteDunningStepAction: vi.fn().mockResolvedValue({ ok: true }),
}));

const STEP: DunningStepDTO = {
  id: 'passo-1',
  offsetDays: -3,
  action: 'SEND_MESSAGE',
  templateBody: 'Texto salvo do passo.',
  metaTemplateName: null,
  metaTemplateParams: null,
  isActive: true,
};

function setup() {
  render(
    <StepAxis
      ruleId="regua-1"
      steps={[STEP]}
      charges={[]}
      settings={{ timezone: 'America/Sao_Paulo', pixKey: '123', businessName: 'MT Conexões' }}
    />,
  );
}

/**
 * Bug encontrado no navegador em 25/08/2026: `key={editing?.id ?? 'new'}` dá a
 * mesma chave a duas aberturas seguidas de "Novo passo", então o React reusa a
 * instância e o react-hook-form devolve o formulário do passo anterior. Mesma
 * família do diálogo de pagamento corrigido em 103e83d — o conteúdo segue
 * montado durante a animação de fechamento.
 */
describe('StepAxis — a gaveta de passo não guarda estado entre aberturas', () => {
  it('"Novo passo" abre limpo depois de outro "Novo passo"', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /adicionar passo/i }));
    await user.type(screen.getByLabelText(/texto da mensagem/i), 'rascunho descartado');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /adicionar passo/i }));
    expect(screen.getByLabelText(/texto da mensagem/i)).toHaveValue('');
  });

  it('reabrir um passo existente descarta a edição não salva', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /editar passo/i }));
    const campo = screen.getByLabelText(/texto da mensagem/i);
    await user.clear(campo);
    await user.type(campo, 'texto que o operador desistiu de salvar');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /editar passo/i }));
    expect(screen.getByLabelText(/texto da mensagem/i)).toHaveValue('Texto salvo do passo.');
  });

  it('editar um passo não deixa resíduo no "Novo passo" seguinte', async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole('button', { name: /editar passo/i }));
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /adicionar passo/i }));
    expect(screen.getByLabelText(/texto da mensagem/i)).toHaveValue('');
  });
});
