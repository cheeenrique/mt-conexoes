/**
 * Seed de dado de demonstração — fornecedor e planos reais que o dono do
 * produto passou, pra ele conferir as telas com dado de verdade.
 *
 * Separado de seed.ts (que cuida de usuário, settings e régua padrão)
 * porque este arquivo é opcional e roda só quando alguém quer olhar a
 * interface no navegador. Nunca faz parte de `prisma db seed` automático.
 *
 * ⚠️ NUNCA rodar contra o banco de teste (TEST_DATABASE_URL). Este script só
 * lê DATABASE_URL (o de dev) — não lê TEST_DATABASE_URL. A guarda abaixo
 * recusa rodar se, por engano, as duas variáveis apontarem pro mesmo banco.
 *
 * Uso: pnpm db:seed:demo
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (process.env.TEST_DATABASE_URL && process.env.DATABASE_URL === process.env.TEST_DATABASE_URL) {
  console.error('[seed-demo] DATABASE_URL aponta pro banco de teste — recusando rodar.');
  process.exit(1);
}

const SUPPLIER_NAME = 'Painel P2P';
const SUPPLIER_UNIT_COST_CENTS = 1000n; // R$ 10,00 por mês de crédito

// Custo = unitCost × meses do ciclo. O "por mês" que a tela de vendas mostra
// (ex.: R$ 26,67 no semestral) é derivação de exibição — não se grava.
const DEMO_PLANS = [
  { name: 'Mensal', cycle: 'MONTHLY', priceCents: 3500n, costCents: 1000n },
  { name: 'Trimestral', cycle: 'QUARTERLY', priceCents: 9000n, costCents: 3000n },
  { name: 'Semestral', cycle: 'SEMIANNUAL', priceCents: 16000n, costCents: 6000n },
  { name: 'Anual', cycle: 'ANNUAL', priceCents: 30000n, costCents: 12000n },
] as const;

async function main() {
  const db = new PrismaClient();
  try {
    const supplier = await db.supplier.upsert({
      where: { name: SUPPLIER_NAME },
      update: { unitCostCents: SUPPLIER_UNIT_COST_CENTS },
      create: { name: SUPPLIER_NAME, unitCostCents: SUPPLIER_UNIT_COST_CENTS },
    });
    console.log(`[seed-demo] fornecedor pronto: ${supplier.name} (id ${supplier.id})`);

    for (const plan of DEMO_PLANS) {
      const record = await db.plan.upsert({
        where: { name: plan.name },
        update: {
          priceCents: plan.priceCents,
          costCents: plan.costCents,
          cycle: plan.cycle,
          supplierId: supplier.id,
        },
        create: {
          name: plan.name,
          priceCents: plan.priceCents,
          costCents: plan.costCents,
          cycle: plan.cycle,
          supplierId: supplier.id,
        },
      });
      console.log(`[seed-demo] plano pronto: ${record.name} (${record.cycle})`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed-demo] falhou:', err);
  process.exit(1);
});
