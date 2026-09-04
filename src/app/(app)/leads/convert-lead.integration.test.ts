import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createLead } from '@/features/leads/service';
import { LeadAlreadyConvertedError, LeadNotFoundError } from '@/features/leads/service';
import { convertLeadToCustomer } from './convert-lead';

const LEAD_NAME = 'Lead Conversao Teste';
const CUSTOMER_NAME = 'Cliente Conversao Teste';
const OTHER_NAME = 'Nome Diferente Ignorado';
const PHONE = '+5562991800001';
const SUPPLIER_NAME = 'Fornecedor Conversao Teste';
const PLAN_NAME = 'Plano Conversao Teste';

const NAMES = [LEAD_NAME, CUSTOMER_NAME, OTHER_NAME];

let planId: string;
let supplierId: string;

/**
 * Purga por chave natural nos dois lados. O Postgres de integração é
 * compartilhado entre suítes e sessões: resíduo de uma passada que morreu no
 * meio (cliente ou lead da fixture ainda no banco) confunde os testes de
 * "existe um cliente com esse telefone" da passada seguinte, sem ter relação
 * nenhuma com o código sob teste. FK obriga a ordem cobrança → assinatura →
 * cliente.
 */
async function purge() {
  const customers = await db.customer.findMany({
    where: { OR: [{ name: { in: NAMES } }, { phone: PHONE }] },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);

  await db.lead.deleteMany({ where: { name: LEAD_NAME } });
  if (customerIds.length > 0) {
    await db.charge.deleteMany({ where: { customerId: { in: customerIds } } });
    await db.subscription.deleteMany({ where: { customerId: { in: customerIds } } });
    await db.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  await db.plan.deleteMany({ where: { name: PLAN_NAME } });
  await db.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
}

beforeEach(async () => {
  await purge();
  const supplier = await db.supplier.create({ data: { name: SUPPLIER_NAME, unitCostCents: 2000n } });
  supplierId = supplier.id;
  const plan = await db.plan.create({
    data: { name: PLAN_NAME, priceCents: 5000n, costCents: 2000n, cycle: 'MONTHLY', supplierId },
  });
  planId = plan.id;
});

afterEach(purge);

function seedLead() {
  return createLead({ name: LEAD_NAME, phone: PHONE, source: 'site · planos', interestPlan: 'Mensal' });
}

function convertValues(overrides: Partial<Parameters<typeof convertLeadToCustomer>[1]> = {}) {
  return {
    name: CUSTOMER_NAME,
    phone: PHONE,
    notes: 'Veio do formulário do site, origem site · planos.',
    planId,
    supplierId,
    priceCents: '5000',
    costCents: '2000',
    cycle: 'MONTHLY' as const,
    screens: 1,
    ...overrides,
  };
}

describe('convertLeadToCustomer', () => {
  it('cria cliente, assinatura e a primeira cobrança no mesmo commit', async () => {
    const lead = await seedLead();

    const result = await convertLeadToCustomer(lead.id, convertValues());

    expect(result.reusedExistingCustomer).toBe(false);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: result.customerId } });
    expect(customer.phone).toBe(PHONE);

    const subscriptions = await db.subscription.findMany({ where: { customerId: result.customerId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]?.priceCents).toBe(5000n);
    expect(subscriptions[0]?.costCents).toBe(2000n);
    expect(subscriptions[0]?.planId).toBe(planId);
    expect(subscriptions[0]?.supplierId).toBe(supplierId);

    // CLAUDE.md §"Data e fuso": criação da assinatura é um dos dois momentos
    // em que uma cobrança nasce. Converter um lead passa a emitir cobrança —
    // é intencional, e é por isso que o valor é campo visível do drawer.
    const charges = await db.charge.findMany({ where: { customerId: result.customerId } });
    expect(charges).toHaveLength(1);
    expect(charges[0]?.principalCents).toBe(5000n);
    expect(charges[0]?.costCents).toBe(2000n);

    const saved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe('CONVERTED');
    expect(saved.customerId).toBe(result.customerId);
  });

  /**
   * Regra 2 do handoff 08. Cliente que já existe é apontado, nunca duplicado —
   * e **sem assinatura nova**: uma segunda assinatura ativa emitiria uma
   * segunda cobrança em aberto no mesmo ciclo, porque o índice único parcial
   * das cobranças é por assinatura, não por cliente.
   */
  it('vincula ao cliente existente sem criar assinatura nem cobrança', async () => {
    const existing = await db.customer.create({ data: { name: CUSTOMER_NAME, phone: PHONE } });
    const lead = await seedLead();

    const result = await convertLeadToCustomer(lead.id, convertValues({ name: OTHER_NAME }));

    expect(result).toEqual({
      customerId: existing.id,
      subscriptionId: null,
      reusedExistingCustomer: true,
      customerName: CUSTOMER_NAME,
    });
    expect(await db.customer.count({ where: { phone: PHONE } })).toBe(1);
    // Não sobrescreve o cadastro existente com o que o lead trazia.
    const customer = await db.customer.findUniqueOrThrow({ where: { id: existing.id } });
    expect(customer.name).toBe(CUSTOMER_NAME);

    expect(await db.subscription.count({ where: { customerId: existing.id } })).toBe(0);
    expect(await db.charge.count({ where: { customerId: existing.id } })).toBe(0);

    const saved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe('CONVERTED');
    expect(saved.customerId).toBe(existing.id);
  });

  // Removido: o teste antigo afirmava que duas conversões simultâneas do
  // mesmo WhatsApp reconciliavam num único `Customer`, garantido pelo
  // `@@unique([phone])` que segurava a segunda escrita. Telefone não é mais
  // único (migration 00000000000020 — duas pessoas cobradas separadamente
  // podem dividir um WhatsApp), então não existe mais trava de banco
  // reconciliando a corrida. O resultado de duas conversões concorrentes de
  // verdade passa a depender de timing (nenhuma garantia determinística pra
  // testar) — aceito porque conversão de lead é ação de operador único, não
  // tráfego concorrente real.

  it('recusa converter o mesmo lead duas vezes', async () => {
    const lead = await seedLead();
    await convertLeadToCustomer(lead.id, convertValues());

    await expect(convertLeadToCustomer(lead.id, convertValues())).rejects.toBeInstanceOf(
      LeadAlreadyConvertedError,
    );
  });

  it('erro de domínio quando o lead não existe', async () => {
    await expect(
      convertLeadToCustomer('019199aa-0000-7000-8000-000000000000', convertValues()),
    ).rejects.toBeInstanceOf(LeadNotFoundError);
  });
});
