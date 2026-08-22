import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FichaMessages } from './ficha-messages';
import type { FichaMessageDTO } from '../../ficha-types';

const TZ = 'America/Sao_Paulo';

function makeMessage(overrides: Partial<FichaMessageDTO> = {}): FichaMessageDTO {
  return {
    id: '1',
    status: 'CANCELLED',
    body: 'Sua cobrança venceu.',
    at: '2026-08-08T12:00:00Z',
    failReason: null,
    cancelReason: null,
    ...overrides,
  };
}

describe('FichaMessages', () => {
  it('mostra o motivo do cancelamento traduzido', () => {
    render(<FichaMessages messages={[makeMessage({ cancelReason: 'stale' })]} timezone={TZ} />);
    expect(screen.getByText(/mensagem parada há mais de 24h/i)).toBeInTheDocument();
  });

  it('sem cancelReason não mostra linha de cancelamento', () => {
    render(<FichaMessages messages={[makeMessage({ status: 'SENT', cancelReason: null })]} timezone={TZ} />);
    expect(screen.queryByText(/Cancelada:/)).not.toBeInTheDocument();
  });

  // Antipadrão já cometido: inferir na tela um motivo que o job não gravou.
  it('motivo desconhecido aparece cru, sem tradução inventada', () => {
    render(<FichaMessages messages={[makeMessage({ cancelReason: 'motivo_novo_do_job' })]} timezone={TZ} />);
    expect(screen.getByText('Cancelada: motivo_novo_do_job')).toBeInTheDocument();
  });

  it('mostra data e hora no fuso do negócio', () => {
    render(<FichaMessages messages={[makeMessage({ at: '2026-08-09T01:00:00Z' })]} timezone={TZ} />);
    expect(screen.getByText('08/08/2026')).toBeInTheDocument();
    expect(screen.getByText('22:00')).toBeInTheDocument();
  });

  it('cliente sem mensagem tem texto próprio', () => {
    render(<FichaMessages messages={[]} timezone={TZ} />);
    expect(screen.getByText('Nenhuma mensagem enviada ainda.')).toBeInTheDocument();
  });
});
