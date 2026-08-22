import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { LEAD_MAX_ATTEMPTS_PER_WINDOW } from '@/core/lead-rate-limit';
import { OPTIONS, POST } from './route';

const IP = '203.0.113.7';
const SOURCE = 'site · teste-integracao';
const ALLOWED_ORIGIN = 'https://mtconexoes.example';

function payload(overrides: Record<string, unknown> = {}) {
  return { name: 'Michele Farias', phone: '(62) 99180-2244', source: SOURCE, ...overrides };
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': IP, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  delete process.env.TURNSTILE_SECRET_KEY;
  process.env.LEADS_ALLOWED_ORIGINS = ALLOWED_ORIGIN;
  await db.leadAttempt.deleteMany({ where: { ip: IP } });
  await db.lead.deleteMany({ where: { source: SOURCE } });
});

afterEach(async () => {
  delete process.env.LEADS_ALLOWED_ORIGINS;
  await db.leadAttempt.deleteMany({ where: { ip: IP } });
  await db.lead.deleteMany({ where: { source: SOURCE } });
});

describe('POST /api/leads', () => {
  it('grava o lead e devolve 201 sem expor o id', async () => {
    const res = await post(payload({ interestPlan: 'Trimestral', city: 'Goiânia' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const lead = await db.lead.findFirstOrThrow({ where: { source: SOURCE } });
    expect(lead.phone).toBe('+5562991802244');
    expect(lead.status).toBe('NEW');
    // Origem preservada com o bloco do site, nunca normalizada para "Site".
    expect(lead.source).toBe(SOURCE);
  });

  it('aceita o mesmo telefone duas vezes — duplicidade é decisão do operador', async () => {
    await post(payload());
    const res = await post(payload());

    expect(res.status).toBe(201);
    expect(await db.lead.count({ where: { source: SOURCE } })).toBe(2);
  });

  it('recusa entrada inválida com 400 e sem detalhe interno', async () => {
    const res = await post(payload({ phone: '123' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'VALIDATION' });
  });

  it('recusa campo desconhecido — `.strict()` na borda pública', async () => {
    const res = await post(payload({ isAdmin: true }));

    expect(res.status).toBe(400);
    expect(await db.lead.count({ where: { source: SOURCE } })).toBe(0);
  });

  it('recusa JSON malformado sem vazar stack', async () => {
    const res = await post('{"name":');

    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('JSON');
  });

  it('recusa corpo grande demais antes de fazer o parse', async () => {
    const res = await post(payload({ name: 'x'.repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(await db.lead.count({ where: { source: SOURCE } })).toBe(0);
  });

  it('corta o campo no tamanho máximo, mesmo dentro do limite de corpo', async () => {
    const res = await post(payload({ name: 'x'.repeat(121) }));

    expect(res.status).toBe(400);
  });
});

describe('rate limit por IP', () => {
  it(`bloqueia o envio seguinte ao ${LEAD_MAX_ATTEMPTS_PER_WINDOW}º da janela, com Retry-After`, async () => {
    for (let i = 0; i < LEAD_MAX_ATTEMPTS_PER_WINDOW; i++) {
      expect((await post(payload())).status).toBe(201);
    }

    const blocked = await post(payload());

    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ ok: false, error: 'RATE_LIMITED' });
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await db.lead.count({ where: { source: SOURCE } })).toBe(LEAD_MAX_ATTEMPTS_PER_WINDOW);
  });

  it('conta o IP real do último hop, não o que o cliente forjou à esquerda', async () => {
    for (let i = 0; i < LEAD_MAX_ATTEMPTS_PER_WINDOW; i++) {
      await post(payload());
    }

    const forged = await post(payload(), { 'x-forwarded-for': `1.2.3.4, ${IP}` });

    expect(forged.status).toBe(429);
  });

  // Insistir não pode renovar o bloqueio: o visitante legítimo atrás de NAT
  // de operadora ficaria preso para sempre.
  it('tentativa bloqueada não conta para a janela', async () => {
    for (let i = 0; i < LEAD_MAX_ATTEMPTS_PER_WINDOW; i++) {
      await post(payload());
    }
    await post(payload());
    await post(payload());

    const counted = await db.leadAttempt.count({ where: { ip: IP, outcome: { in: ['ACCEPTED', 'INVALID'] } } });
    expect(counted).toBe(LEAD_MAX_ATTEMPTS_PER_WINDOW);
  });

  it('não guarda telefone nem nome na tabela de tentativas', async () => {
    await post(payload());

    const attempt = await db.leadAttempt.findFirstOrThrow({ where: { ip: IP } });
    expect(JSON.stringify(attempt)).not.toContain('99180');
    expect(JSON.stringify(attempt)).not.toContain('Michele');
  });

  it('entrada inválida também consome a janela — senão o bot só manda lixo', async () => {
    await post(payload({ phone: '123' }));

    expect(await db.leadAttempt.count({ where: { ip: IP, outcome: 'INVALID' } })).toBe(1);
  });
});

describe('Turnstile', () => {
  it('recusa envio sem token quando a chave está configurada', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'chave-de-teste';

    const res = await post(payload());

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, error: 'CHALLENGE_REJECTED' });
    expect(await db.lead.count({ where: { source: SOURCE } })).toBe(0);
  });
});

describe('CORS', () => {
  it('libera a origem do site na preflight', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: ALLOWED_ORIGIN } }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  });

  it('não libera origem fora da lista', async () => {
    const res = await OPTIONS(
      new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: 'https://spam.example' } }),
    );

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('devolve o cabeçalho de CORS também no POST liberado', async () => {
    const res = await post(payload(), { origin: ALLOWED_ORIGIN });

    expect(res.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  });
});

describe('CORS sem allowlist configurada', () => {
  it('libera qualquer origem quando LEADS_ALLOWED_ORIGINS está vazia', async () => {
    delete process.env.LEADS_ALLOWED_ORIGINS;

    const res = await OPTIONS(
      new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: 'https://qualquer.example' } }),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('não manda Allow-Credentials junto com o wildcard', async () => {
    delete process.env.LEADS_ALLOWED_ORIGINS;

    const res = await OPTIONS(
      new Request('http://localhost/api/leads', { method: 'OPTIONS', headers: { origin: 'https://qualquer.example' } }),
    );

    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
  });
});
