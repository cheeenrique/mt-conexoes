import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { POST, GET } from './route';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 3).toString('base64');
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-token-teste';

const APP_SECRET = 'app-secret-teste';

afterEach(async () => {
  await db.customer.deleteMany({ where: { name: 'Webhook Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'META_CLOUD' } });
});

async function seedChannel() {
  const credentials = encrypt(
    JSON.stringify({ accessToken: 'a', phoneNumberId: 'b', wabaId: 'c', appSecret: APP_SECRET }),
    'channel.credentials',
  );
  return db.channelConfig.create({ data: { provider: 'META_CLOUD', label: 'Meta', isActive: true, credentials } });
}

function sign(body: string): string {
  return 'sha256=' + createHmac('sha256', APP_SECRET).update(body).digest('hex');
}

describe('POST /api/webhooks/meta-cloud', () => {
  it('assinatura inválida devolve 401 sem corpo', async () => {
    await seedChannel();
    const body = '{"entry":[]}';
    const req = new Request('http://localhost/api/webhooks/meta-cloud', {
      method: 'POST', body, headers: { 'x-hub-signature-256': 'sha256=errado' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });

  it('sem canal ativo devolve 404', async () => {
    const body = '{"entry":[]}';
    const req = new Request('http://localhost/api/webhooks/meta-cloud', { method: 'POST', body });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('mensagem válida processa e devolve 200', async () => {
    await seedChannel();
    await db.customer.create({ data: { name: 'Webhook Teste', phone: '5511999990020' } });
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: '5511999990020', text: { body: 'Oi' } }] } }] }] });
    const req = new Request('http://localhost/api/webhooks/meta-cloud', {
      method: 'POST', body, headers: { 'x-hub-signature-256': sign(body) },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const messages = await db.message.findMany({ where: { customer: { name: 'Webhook Teste' } } });
    expect(messages).toHaveLength(1);
    await db.message.deleteMany({ where: { customer: { name: 'Webhook Teste' } } });
  });
});

describe('GET /api/webhooks/meta-cloud (handshake)', () => {
  it('responde o challenge com token correto', async () => {
    const url = 'http://localhost/api/webhooks/meta-cloud?hub.mode=subscribe&hub.verify_token=verify-token-teste&hub.challenge=abc123';
    const res = await GET(new Request(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('abc123');
  });

  it('token errado devolve 403', async () => {
    const url = 'http://localhost/api/webhooks/meta-cloud?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123';
    const res = await GET(new Request(url));
    expect(res.status).toBe(403);
  });
});
