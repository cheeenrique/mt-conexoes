/**
 * Seed idempotente do primeiro usuário do painel.
 *
 * Lê SEED_USER_EMAIL / SEED_USER_PASSWORD do ambiente. Sem elas, cai em
 * defaults de desenvolvimento — a senha usada é sempre impressa no stdout
 * pra quem rodar localmente conseguir logar.
 *
 * Uso: pnpm db:seed  (ou `prisma db seed`, registrado em package.json)
 */
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';

// tsx não lê .env.local sozinho — mesmo padrão de tests/setup-integration.ts.
config({ path: '.env.local' });

const DEFAULT_EMAIL = 'admin@mtconexoes.com.br';
const DEV_PASSWORD_BYTES = 12;

function devPassword(): string {
  return randomBytes(DEV_PASSWORD_BYTES).toString('base64url');
}

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? DEFAULT_EMAIL;
  const usedFallbackPassword = !process.env.SEED_USER_PASSWORD;
  const password = process.env.SEED_USER_PASSWORD ?? devPassword();

  const passwordHash = await hash(password);

  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email } });

    // Não sobrescreve a senha de um usuário que já existe — rodar o seed de
    // novo não pode reverter a troca de senha feita pela tela /conta.
    const user = existing
      ? existing
      : await db.user.create({ data: { email, name: 'Admin', passwordHash } });

    console.log(`[seed] usuário pronto: ${user.email} (id ${user.id})`);
    if (existing) {
      console.log('[seed] usuário já existia — senha mantida.');
    } else if (usedFallbackPassword) {
      console.log(`[seed] SEED_USER_PASSWORD não definida — senha gerada: ${password}`);
    }

    const settings = await db.settings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton', businessName: 'MT Conexões' },
    });
    console.log(`[seed] settings pronto: ${settings.businessName}`);

    const defaultRule = await db.dunningRule.upsert({
      where: { id: 'default-rule' },
      update: {},
      create: {
        id: 'default-rule',
        name: 'Régua padrão',
        status: 'REVIEW',
        isDefault: true,
      },
    });

    const DEFAULT_STEPS: { offsetDays: number; action: 'SEND_MESSAGE' | 'SUSPEND'; templateBody: string | null }[] = [
      { offsetDays: -5, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence em breve, dia {{cobranca.vencimento}}.\n\n{{negocio.nome}}' },
      { offsetDays: -2, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence dia {{cobranca.vencimento}}.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 0, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}! Sua renovação de {{cobranca.valor}} vence hoje ({{cobranca.vencimento}}).\n\nPix: {{pix.chave}}\n\nQualquer dúvida, é só responder aqui.\n{{negocio.nome}}' },
      { offsetDays: 1, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}, sua renovação de {{cobranca.valor}} está {{cobranca.dias_atraso}} dia(s) atrasada.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 3, action: 'SEND_MESSAGE', templateBody: 'Olá {{cliente.primeiro_nome}}, último aviso: sua renovação de {{cobranca.valor}} está {{cobranca.dias_atraso}} dia(s) atrasada e o acesso pode ser suspenso.\n\nPix: {{pix.chave}}\n\n{{negocio.nome}}' },
      { offsetDays: 5, action: 'SUSPEND', templateBody: null },
    ];

    for (const step of DEFAULT_STEPS) {
      await db.dunningStep.upsert({
        where: { ruleId_offsetDays: { ruleId: defaultRule.id, offsetDays: step.offsetDays } },
        update: {},
        create: { ruleId: defaultRule.id, ...step },
      });
    }
    console.log(`[seed] régua padrão pronta: ${defaultRule.name} (${DEFAULT_STEPS.length} passos)`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] falhou:', err);
  process.exit(1);
});
