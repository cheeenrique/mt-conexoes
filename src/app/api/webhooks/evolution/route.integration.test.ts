import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { encrypt } from '@/lib/crypto';
import { POST } from './route';

process.env.CREDENTIAL_KEY = process.env.CREDENTIAL_KEY ?? Buffer.alloc(32, 3).toString('base64');
const WEBHOOK_TOKEN = 'evo-webhook-token-teste';

afterEach(async () => {
  await db.customer.deleteMany({ where: { name: 'Webhook Evo Teste' } });
  await db.channelConfig.deleteMany({ where: { provider: 'EVOLUTION' } });
});

async function seedChannel() {
  const credentials = encrypt(
    JSON.stringify({ baseUrl: 'https://evo.example.com', apiKey: 'k', instanceName: 'i', webhookToken: WEBHOOK_TOKEN }),
    'channel.credentials',
  );
  return db.channelConfig.create({ data: { provider: 'EVOLUTION', label: 'Evo', isActive: true, credentials } });
}

describe('POST /api/webhooks/evolution', () => {
  it('token inválido devolve 401 sem corpo', async () => {
    await seedChannel();
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body: '{}', headers: { apikey: 'errado' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });

  it('sem canal ativo devolve 404', async () => {
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body: '{}', headers: { apikey: 'qualquer' },
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('mensagem válida processa e devolve 200', async () => {
    await seedChannel();
    // Customer.phone é E.164 com "+" (schema Zod); o remoteJid da Evolution manda o número sem "+".
    await db.customer.create({ data: { name: 'Webhook Evo Teste', phone: '+5511999990030' } });
    const body = JSON.stringify({ data: { key: { remoteJid: '5511999990030@s.whatsapp.net', fromMe: false }, message: { conversation: 'Oi' } } });
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body, headers: { apikey: WEBHOOK_TOKEN },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const messages = await db.message.findMany({ where: { customer: { name: 'Webhook Evo Teste' } } });
    expect(messages).toHaveLength(1);
    await db.message.deleteMany({ where: { customer: { name: 'Webhook Evo Teste' } } });
  });

  it('mensagem "PARE" marca opt-out do customer mesmo com telefone em formatos diferentes', async () => {
    await seedChannel();
    await db.customer.create({ data: { name: 'Webhook Evo Teste', phone: '+5511999990031' } });
    const body = JSON.stringify({ data: { key: { remoteJid: '5511999990031@s.whatsapp.net', fromMe: false }, message: { conversation: 'PARE' } } });
    const req = new Request('http://localhost/api/webhooks/evolution', {
      method: 'POST', body, headers: { apikey: WEBHOOK_TOKEN },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const customer = await db.customer.findFirstOrThrow({ where: { name: 'Webhook Evo Teste', phone: '+5511999990031' } });
    expect(customer.optedOut).toBe(true);
    await db.message.deleteMany({ where: { customer: { name: 'Webhook Evo Teste' } } });
  });
});
