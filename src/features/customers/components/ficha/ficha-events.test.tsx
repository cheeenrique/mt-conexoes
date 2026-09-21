import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FichaEvents } from './ficha-events';
import type { FichaEventDTO } from '../../ficha-types';

const TIMEZONE = 'America/Sao_Paulo';

function event(overrides: Partial<FichaEventDTO> = {}): FichaEventDTO {
  return {
    id: 'evento-1',
    kind: 'SUBSCRIPTION_PLAN_CHANGED',
    summary: 'Trimestral R$ 90,00 → Mensal R$ 35,00',
    reason: null,
    at: '2026-09-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('FichaEvents', () => {
  it('mostra o rótulo em pt-BR e o resumo do que mudou', () => {
    render(<FichaEvents events={[event()]} timezone={TIMEZONE} />);

    expect(screen.getByText('Plano trocado')).toBeTruthy();
    expect(screen.getByText('Trimestral R$ 90,00 → Mensal R$ 35,00')).toBeTruthy();
  });

  it('mostra o motivo quando o operador escreveu um', () => {
    render(<FichaEvents events={[event({ reason: 'cliente pediu no WhatsApp' })]} timezone={TIMEZONE} />);

    expect(screen.getByText(/cliente pediu no WhatsApp/)).toBeTruthy();
  });

  // Empty state aponta para o que significa, não para "nenhum registro".
  it('sem eventos, explica que nada mudou ainda', () => {
    render(<FichaEvents events={[]} timezone={TIMEZONE} />);

    expect(screen.getByText(/Nada mudou nesta assinatura ainda/)).toBeTruthy();
  });
});
