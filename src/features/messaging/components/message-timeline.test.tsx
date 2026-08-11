import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageTimeline } from './message-timeline';
import type { MessageDTO } from '../queries';

const TZ = 'America/Sao_Paulo';

function makeMessage(overrides: Partial<MessageDTO> = {}): MessageDTO {
  return {
    id: '1', kind: 'DUNNING', status: 'CANCELLED', body: 'Sua cobrança venceu.',
    sentAt: null, failReason: null, cancelReason: null, createdAt: '2026-08-08T12:00:00Z',
    ...overrides,
  };
}

describe('MessageTimeline', () => {
  it('mostra o motivo do cancelamento traduzido', () => {
    render(<MessageTimeline messages={[makeMessage({ cancelReason: 'stale' })]} timezone={TZ} />);
    expect(screen.getByText(/mensagem parada há mais de 24h/i)).toBeInTheDocument();
  });

  it('sem cancelReason não mostra linha de cancelamento', () => {
    render(<MessageTimeline messages={[makeMessage({ status: 'SENT', cancelReason: null })]} timezone={TZ} />);
    expect(screen.queryByText(/Cancelada:/)).not.toBeInTheDocument();
  });
});
