import { config } from 'dotenv';

config({ path: '.env.local' });

// O Prisma client (src/lib/db.ts) lê DATABASE_URL do processo. Testes de
// integração precisam do banco isolado (TEST_DATABASE_URL) — nunca do de dev,
// que `pnpm dev` também usa. Ver prisma/README.md.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const resolvedUrl = testDatabaseUrl ?? process.env.DATABASE_URL;

if (!resolvedUrl) {
  throw new Error(
    'Nem TEST_DATABASE_URL nem DATABASE_URL definidos. Suba o banco de teste ' +
      '(`docker compose up -d db-test`), copie TEST_DATABASE_URL de .env.example ' +
      'para .env.local e rode `pnpm db:migrate:test`.',
  );
}

if (!testDatabaseUrl) {
  console.warn(
    '[test:integration] TEST_DATABASE_URL não definido — caindo para DATABASE_URL ' +
      '(banco de DEV). Isso reintroduz o problema que TEST_DATABASE_URL existe pra evitar: ' +
      'a suíte pode afirmar totais globais que o dado de dev quebra, e a suíte pode sujar ' +
      'o banco que `pnpm dev` usa. Defina TEST_DATABASE_URL em .env.local e rode ' +
      '`pnpm db:migrate:test`.',
  );
}

process.env.DATABASE_URL = resolvedUrl;
