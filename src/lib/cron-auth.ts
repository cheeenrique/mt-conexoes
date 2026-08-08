import { OAuth2Client } from 'google-auth-library';
import { requireEnv } from './env';

/**
 * Guard do endpoint de health-check (/api/cron/ping), que não escreve no banco.
 * Dev e produção: bearer token fixo (CRON_SECRET), batido pelo container cron-sim
 * do docker-compose. Jobs de negócio usam assertCloudSchedulerToken (OIDC em produção).
 */
export function assertCronRequest(req: Request): void {
  const auth = req.headers.get('authorization');
  const expected = `Bearer ${requireEnv('CRON_SECRET')}`;
  if (auth !== expected) throw new Error('unauthorized');
}

const oidcClient = new OAuth2Client();

/**
 * Produção: Cloud Scheduler chama com token OIDC assinado pelo Google —
 * valida emissor e audiência antes de aceitar. Desenvolvimento: sem
 * infraestrutura de OIDC local, aceita o mesmo bearer token fixo do
 * cron-sim (CRON_SECRET) — mesmo mecanismo de assertCronRequest, pra não
 * duplicar o dev-token em dois lugares com semânticas diferentes.
 */
export async function assertCloudSchedulerToken(req: Request): Promise<void> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) throw new Error('unauthorized');
  const token = auth.slice('Bearer '.length);

  if (process.env.NODE_ENV !== 'production') {
    if (token !== requireEnv('CRON_SECRET')) throw new Error('unauthorized');
    return;
  }

  const audience = requireEnv('CRON_OIDC_AUDIENCE');
  const ticket = await oidcClient.verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  if (!payload || payload.iss !== 'https://accounts.google.com') {
    throw new Error('unauthorized');
  }
}
