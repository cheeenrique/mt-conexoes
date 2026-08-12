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

describe('DueDateStrip', () => {
  it.each(DUE_DATE_BUCKETS)('link do balde %s sobrevive ao round-trip pela URL', (key) => {
    render(<DueDateStrip buckets={buckets} selected="D0" />);

    const link = screen.getByRole('link', { name: new RegExp(`^${key.replace('+', '\\+')}`) });
    const href = link.getAttribute('href')!;
    const query = href.slice(href.indexOf('?'));

    // Simula o que o browser faz: resolve o href contra a URL atual e
    // deixa o próprio URLSearchParams decodificar o valor. `D+1` só quebra
    // se alguém chamar parseBucket com a string já digitada à mão — aqui
    // passamos pelo parsing real de query string, onde `+` vira espaço se
    // não estiver encoded.
    const params = new URLSearchParams(query);
    expect(params.get('bucket')).toBe(key);
  });
});
