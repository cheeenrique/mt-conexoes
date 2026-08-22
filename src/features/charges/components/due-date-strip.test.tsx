import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DueDateStrip } from './due-date-strip';
import { DUE_DATE_BUCKETS } from '@/core/due-date-buckets';
import type { DueDateOverview } from '../queries';

const buckets: DueDateOverview['buckets'] = DUE_DATE_BUCKETS.map((key) => ({
  key,
  label: key,
  count: 0,
  amountCents: '0',
}));

function linkFor(key: string) {
  return screen.getByRole('link', { name: new RegExp(`^${key.replace('+', '\\+')}:`) });
}

describe('DueDateStrip', () => {
  it.each(DUE_DATE_BUCKETS)('link do balde %s sobrevive ao round-trip pela URL', (key) => {
    render(<DueDateStrip buckets={buckets} selected={null} todayLabel="22/08/2026" />);

    const href = linkFor(key).getAttribute('href')!;
    const query = href.slice(href.indexOf('?'));

    // Simula o que o browser faz: resolve o href contra a URL atual e
    // deixa o próprio URLSearchParams decodificar o valor. `D+1` só quebra
    // se alguém chamar parseBucket com a string já digitada à mão — aqui
    // passamos pelo parsing real de query string, onde `+` vira espaço se
    // não estiver encoded.
    const params = new URLSearchParams(query);
    expect(params.get('bucket')).toBe(key);
  });

  it('segundo clique na coluna selecionada limpa o filtro', () => {
    render(<DueDateStrip buckets={buckets} selected="D+3" todayLabel="22/08/2026" />);

    const selectedLink = linkFor('D+3');
    expect(selectedLink).toHaveAttribute('aria-current', 'true');
    expect(new URLSearchParams(selectedLink.getAttribute('href')!.slice(1)).get('bucket')).toBeNull();
  });

  it('atraso vem primeiro e a vencer por último — ordem do handoff, não a de core/', () => {
    render(<DueDateStrip buckets={buckets} selected={null} todayLabel="22/08/2026" />);

    const order = screen.getAllByRole('link').map((link) => link.getAttribute('aria-label')!.split(':')[0]);
    expect(order).toEqual(['D+5', 'D+3', 'D+1', 'D0', 'D-2', 'D-5']);
  });

  it('as três zonas ficam rotuladas acima das barras', () => {
    render(<DueDateStrip buckets={buckets} selected={null} todayLabel="22/08/2026" />);

    expect(screen.getByText('Atraso')).toBeInTheDocument();
    expect(screen.getByText('Hoje')).toBeInTheDocument();
    expect(screen.getByText('A vencer')).toBeInTheDocument();
  });
});
