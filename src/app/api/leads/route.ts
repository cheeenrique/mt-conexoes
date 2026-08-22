import { getClientIp } from '@/lib/net';
import { logger } from '@/lib/logger';
import {
  LeadChallengeRejectedError,
  LeadRateLimitedError,
  captureLead,
  recordRejectedIntake,
} from '@/features/leads/intake.service';
import { leadIntakeSchema } from '@/features/leads/schema';

/**
 * Captação do site público — a única ligação entre as duas aplicações
 * (ver `docs/projeto/tecnico/08-site.md`).
 *
 * ⚠️ Endpoint sem sessão que escreve no banco. As quatro defesas exigidas
 * por `02-modelo-de-dados.md` estão aqui e no service: teto de corpo antes
 * do parse, Zod estrito com `.max()` em cada campo, rate limit por IP em
 * tabela e Turnstile no servidor. Os `CHECK` de tamanho ficam na migration
 * `00000000000012_leads`.
 *
 * ⚠️ O corpo da resposta nunca carrega detalhe: só um código estável. O site
 * não mostra erro nosso ao visitante — ele cai para o WhatsApp. Vazar
 * mensagem de validação daria a um bot o mapa exato do que ajustar.
 */

/** Acima do maior corpo legítimo possível (todos os campos no teto + token do Turnstile). */
const MAX_BODY_BYTES = 8 * 1024;

const ERROR_STATUS = {
  VALIDATION: 400,
  PAYLOAD_TOO_LARGE: 413,
  CHALLENGE_REJECTED: 403,
  RATE_LIMITED: 429,
  UNEXPECTED: 500,
} as const;

function allowedOrigins(): string[] {
  return (process.env.LEADS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * O site roda em outro domínio, então o POST do formulário é cross-origin e
 * passa por preflight. Origem fora da lista simplesmente não recebe o
 * cabeçalho: o navegador bloqueia e o formulário cai para o WhatsApp, que é
 * a degradação desejada. Chamada servidor-a-servidor não manda `Origin` e
 * segue funcionando.
 *
 * ⚠️ TEMPORÁRIO — `LEADS_ALLOWED_ORIGINS` vazia libera qualquer origem
 * (`*`), porque o site de captação (`docs/projeto/tecnico/08-site.md`)
 * ainda não tem domínio de produção: sem isso o preflight não devolve
 * cabeçalho nenhum e o formulário do site cai pro WhatsApp por falta de
 * config, não por decisão. CORS nunca foi a proteção deste endpoint — quem
 * protege é o Zod `.strict()`, o teto de 8 KB do corpo, o rate limit por IP
 * em `lead_attempts` e o Turnstile (desligado por padrão até a decisão de
 * ligar). `*` é seguro aqui porque o endpoint nunca manda
 * `access-control-allow-credentials`. Aperta preenchendo
 * `LEADS_ALLOWED_ORIGINS` com a origem de produção assim que o domínio
 * existir — a allowlist volta a valer sozinha, sem tocar em código.
 */
function corsHeaders(req: Request): Record<string, string> {
  const allowed = allowedOrigins();
  if (allowed.length === 0) {
    return {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
    };
  }

  const origin = req.headers.get('origin');
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function fail(req: Request, error: keyof typeof ERROR_STATUS, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(
    { ok: false, error },
    { status: ERROR_STATUS[error], headers: { ...corsHeaders(req), ...extraHeaders } },
  );
}

export async function OPTIONS(req: Request): Promise<Response> {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request): Promise<Response> {
  const ip = getClientIp(req.headers.get('x-forwarded-for'));

  try {
    const body = await readBoundedBody(req);
    if (body === null) return fail(req, 'PAYLOAD_TOO_LARGE');

    const parsed = leadIntakeSchema.safeParse(body);
    if (!parsed.success) {
      await recordRejectedIntake(ip);
      return fail(req, 'VALIDATION');
    }

    const { leadId } = await captureLead({ data: parsed.data, ip, now: new Date() });
    // Id sim, telefone e nome não — a tabela guarda a PII, o log não.
    logger.info({ route: 'leads.capture', leadId, source: parsed.data.source, status: 201 });
    return Response.json({ ok: true }, { status: 201, headers: corsHeaders(req) });
  } catch (err) {
    if (err instanceof LeadRateLimitedError) {
      return fail(req, 'RATE_LIMITED', { 'retry-after': String(err.retryAfterSeconds) });
    }
    if (err instanceof LeadChallengeRejectedError) {
      return fail(req, 'CHALLENGE_REJECTED');
    }
    logger.error({
      route: 'leads.capture',
      error: String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return fail(req, 'UNEXPECTED');
  }
}

/**
 * Lê o corpo com teto de tamanho e devolve `null` quando estoura.
 *
 * `content-length` é dica do cliente, não garantia — o teto é reconferido
 * sobre os bytes que realmente chegaram. Sem isso, um POST de 10MB vira
 * `JSON.parse` de 10MB antes de qualquer validação.
 */
async function readBoundedBody(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // cai na validação do Zod e vira 400, sem mensagem do parser
  }
}
