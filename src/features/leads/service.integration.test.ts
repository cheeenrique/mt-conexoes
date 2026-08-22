import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { createLead, setLeadStatus } from './service';

// ⚠️ A conversão em cliente mora em `app/(app)/leads/convert-lead.ts` — cruza
// três features e por isso não pode viver aqui. Os testes dela estão em
// `src/app/(app)/leads/convert-lead.integration.test.ts`.

const NAME = 'Lead Captura Teste';
const PHONE = '+5562991800009';

// Purga por chave natural nos dois lados: o Postgres de integração é
// compartilhado entre suítes e sessões, e resíduo de uma passada que morreu no
// meio derruba a próxima com `Unique constraint failed on (phone)` sem ter
// relação nenhuma com o código sob teste.
async function purge() {
  await db.lead.deleteMany({ where: { name: NAME } });
}

beforeEach(purge);
afterEach(purge);

function seedLead(overrides: Partial<{ phone: string; interestPlan: string }> = {}) {
  return createLead({
    name: NAME,
    phone: overrides.phone ?? PHONE,
    source: 'site · planos',
    interestPlan: overrides.interestPlan ?? 'Trimestral',
  });
}

describe('createLead', () => {
  // Regra 1 do handoff: a mesma pessoa pode preencher o formulário duas
  // vezes. Recusar o segundo envio esconde um lead real — quem preenche
  // duas vezes está mais interessado, não menos.
  it('aceita dois leads com o mesmo telefone', async () => {
    await seedLead();
    await seedLead();

    const leads = await db.lead.findMany({ where: { name: NAME } });
    expect(leads).toHaveLength(2);
  });
});

describe('setLeadStatus', () => {
  it('descarta sem apagar o lead', async () => {
    const lead = await seedLead();

    await setLeadStatus(lead.id, 'DISCARDED');

    const saved = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(saved.status).toBe('DISCARDED');
  });
});

describe('constraints do banco', () => {
  // O `if` do service não sobrevive a um UPDATE feito por fora. Lead
  // convertido sem cliente vinculado some da fila de trabalho sem que
  // ninguém consiga chegar no cadastro.
  it('recusa marcar CONVERTED sem customerId', async () => {
    const lead = await seedLead();

    await expect(
      db.lead.update({ where: { id: lead.id }, data: { status: 'CONVERTED' } }),
    ).rejects.toThrow();
  });

  it('recusa nome acima do teto de tamanho', async () => {
    await expect(
      db.lead.create({ data: { name: 'x'.repeat(121), phone: PHONE, source: 'site' } }),
    ).rejects.toThrow();
  });
});
