/**
 * Roda um comando com DATABASE_URL apontando pro Postgres de teste
 * (TEST_DATABASE_URL), sem mexer no DATABASE_URL de dev em .env.local.
 *
 * Uso: tsx scripts/with-test-db.ts <comando> [args...]
 * Ex.: tsx scripts/with-test-db.ts pnpm exec prisma migrate deploy
 */
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

config({ path: '.env.local' });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  console.error(
    '[with-test-db] TEST_DATABASE_URL não definido em .env.local — copie de .env.example ' +
      'e suba o banco com `docker compose up -d db-test`.',
  );
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('[with-test-db] uso: tsx scripts/with-test-db.ts <comando> [args...]');
  process.exit(1);
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: testDatabaseUrl },
});

process.exit(result.status ?? 1);
