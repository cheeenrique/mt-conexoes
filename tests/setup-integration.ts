import { config } from 'dotenv';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definido — suba `docker compose up -d db` e copie .env.example para .env.local');
}
