import { requireEnv } from './env';

/**
 * Dev: bearer token fixo (CRON_SECRET), batido pelo container cron-sim do docker-compose.
 * Produção: Cloud Scheduler chama com OIDC — trocar por verificação real (google-auth-library)
 * antes da Etapa 2, quando os jobs de negócio existirem. Ver docs/projeto/tecnico/05-credenciais-e-seguranca.md.
 */
export function assertCronRequest(req: Request): void {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${requireEnv('CRON_SECRET')}`;
  if (auth !== expected) throw new Error('unauthorized');
}
