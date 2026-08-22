import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageLogDays } from './message-log-days';
import { groupByLocalDay, type MessageLogEntryDTO } from '../message-log-format';

const TZ = 'America/Sao_Paulo';

function entry(overrides: Partial<MessageLogEntryDTO> = {}): MessageLogEntryDTO {
  return {
    id: '1',
    source: 'MESSAGE',
    occurredAt: '2026-08-08T12:03:00.000Z',
    customerId: 'cust-1',
    customerName: 'Cláudia Nunes',
    origin: 'RULE',
    stepLabel: 'D0',
    outcome: 'SENT',
    postponed: false,
    postponedToAt: null,
    reasonCode: null,
    failReason: null,
    body: 'Olá Cláudia! Sua renovação vence hoje.',
    ...overrides,
  };
}

function renderDays(entries: MessageLogEntryDTO[]) {
  return render(<MessageLogDays days={groupByLocalDay(entries, TZ)} timezone={TZ} />);
}

describe('MessageLogDays', () => {
  it('mostra a hora no fuso do negócio, não no do navegador', () => {
    renderDays([entry()]);
    expect(screen.getByText('09:03')).toBeInTheDocument();
  });

  it('explica o pulo em linguagem humana, ao lado do passo', () => {
    renderDays([entry({ outcome: 'SKIPPED', reasonCode: 'daily_dedupe', stepLabel: 'D+3' })]);
    expect(screen.getByText('D+3 · já recebeu mensagem hoje')).toBeInTheDocument();
    expect(screen.getByText('Pulada')).toBeInTheDocument();
  });

  it('marca como adiada, não como pulada, a mensagem que a quiet hour empurrou', () => {
    renderDays([entry({ outcome: 'PENDING', postponed: true, postponedToAt: '2026-08-09T11:00:00.000Z' })]);
    expect(screen.getByText('Adiada')).toBeInTheDocument();
    expect(screen.queryByText('Pulada')).not.toBeInTheDocument();
  });

  it('abre o texto com o rótulo de enviado', async () => {
    renderDays([entry()]);
    await userEvent.click(screen.getByRole('button', { name: /Ver o texto da mensagem de Cláudia Nunes/ }));

    expect(screen.getByText('Texto enviado')).toBeInTheDocument();
    expect(screen.getByText('Olá Cláudia! Sua renovação vence hoje.')).toBeInTheDocument();
  });

  it('troca o rótulo do corpo quando a mensagem não saiu', async () => {
    renderDays([entry({ outcome: 'FAILED', failReason: 'Instância Evolution desconectada' })]);
    await userEvent.click(screen.getByRole('button', { name: /Ver o texto/ }));

    expect(screen.getByText('Texto que seria enviado')).toBeInTheDocument();
    expect(screen.getAllByText('Instância Evolution desconectada').length).toBeGreaterThan(0);
  });

  it('diz que nenhum texto foi montado quando a régua parou antes da mensagem', async () => {
    renderDays([entry({ source: 'EXECUTION', outcome: 'SKIPPED', reasonCode: 'no_phone', body: null })]);
    await userEvent.click(screen.getByRole('button', { name: /Ver o texto/ }));

    expect(screen.getByText(/Nenhum texto foi montado/)).toBeInTheDocument();
  });

  it('não oferece reenvio — reenvio manual é conversa no WhatsApp', () => {
    renderDays([entry({ outcome: 'FAILED' })]);
    expect(screen.queryByRole('button', { name: /reenviar/i })).not.toBeInTheDocument();
  });
});
