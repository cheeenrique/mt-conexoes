import { describe, expect, it, vi, afterEach } from 'vitest';
import { db } from '@/lib/db';
import { GET } from './route';

vi.mock('@/features/auth/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/auth/service')>();
  return { ...actual, requireSession: vi.fn().mockResolvedValue({ id: 'test-user', email: 'test@mtconexoes.com.br', name: 'Teste', sessionVersion: 0 }) };
});

afterEach(async () => {
  await db.charge.deleteMany({ where: { customer: { name: 'Export Teste' } } });
  await db.subscription.deleteMany({ where: { customer: { name: 'Export Teste' } } });
  await db.customer.deleteMany({ where: { name: 'Export Teste' } });
  await db.plan.deleteMany({ where: { name: 'Plano Export' } });
  await db.supplier.deleteMany({ where: { name: 'Fornecedor Export' } });
});

describe('GET /api/reports/export', () => {
  it('sem sessão devolve 401', async () => {
    const { requireSession } = await import('@/features/auth/service');
    vi.mocked(requireSession).mockRejectedValueOnce(new Error('unauthorized'));

    const req = new Request('http://localhost/api/reports/export?type=supplier&year=2026&month=8');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('type inválido devolve 400', async () => {
    const req = new Request('http://localhost/api/reports/export?type=invalido&year=2026&month=8');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('type=supplier devolve CSV com header e Content-Disposition de anexo', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Fornecedor Export', unitCostCents: 1000n } });
    const plan = await db.plan.create({ data: { name: 'Plano Export', priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY' } });
    const customer = await db.customer.create({ data: { name: 'Export Teste', phone: '+5511997776666' } });
    const sub = await db.subscription.create({ data: { customerId: customer.id, planId: plan.id, supplierId: supplier.id, priceCents: 6000n, costCents: 1000n, cycle: 'MONTHLY', status: 'ACTIVE', startedAt: new Date('2026-01-01T12:00:00Z'), nextDueAt: new Date('2026-02-01T12:00:00Z') } });
    await db.charge.create({ data: { subscriptionId: sub.id, customerId: customer.id, supplierId: supplier.id, principalCents: 6000n, costCents: 1000n, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-01'), dueAt: new Date('2026-08-15T23:59:59-03:00'), status: 'OPEN' } });

    const req = new Request('http://localhost/api/reports/export?type=supplier&year=2026&month=8');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const body = await res.text();
    expect(body).toContain('Fornecedor Export');
    expect(body).toContain('R$ 60,00');
  });

  it('type=customer devolve linhas de top e bottom com coluna "grupo"', async () => {
    const req = new Request('http://localhost/api/reports/export?type=customer&year=2026&month=8');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.split('\r\n')[0]).toContain('Grupo');
  });
});
