/**
 * Raio-x da emissão de cobrança e do batimento dos crons, numa passada só.
 *
 * Uso:
 *
 *   pnpm health:charges
 *
 * Só lê. Existe porque **nenhum cron emite cobrança**: uma `Charge` nasce em
 * três momentos, todos disparados por evento — criação da assinatura, quitação
 * do ciclo (`charges/service.ts` → `openNextCycle`) e importação da planilha.
 * Quando a emissão falha, nada grita: a assinatura fica `ACTIVE` e sem cobrança
 * em aberto, o cliente some de `/charges`, dos chips de vencimento e da régua,
 * e não há `chargeId` pra registrar pagamento. Foi exatamente o buraco que
 * `pnpm backfill:imported-charges` teve que tapar depois.
 *
 * Responde cinco perguntas:
 *
 *   1. Alguma assinatura ativa está sem cobrança em aberto? (buraco de emissão)
 *   2. Sobrou cobrança vencida ainda `OPEN`? (sinal de `charges-mark-overdue` parado)
 *   3. Quando saiu a última cobrança? (pulso da emissão)
 *   4. Quando a régua avaliou pela última vez? (pulso de `dunning-evaluate`)
 *   5. Com o envio pausado, quanto está represado — e quanto já passou de 24h?
 *
 * ⚠️ A quinta importa: mensagem `PENDING` parada há mais de 24h vira `CANCELLED`
 * com motivo `stale` na primeira passada depois de despausar (T8), e o
 * `UNIQUE(chargeId, stepId)` impede a régua de gerar aquele par de novo. Fila
 * velha não é fila — é cobrança que nunca vai sair.
 */
import { db } from '@/lib/db';
import { formatCents } from '@/lib/format';
import { getSettings } from '@/lib/settings';

const OPEN_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] as const;
const STALE_MS = 24 * 60 * 60 * 1000;

function stamp(date: Date, timezone: string): string {
  return date.toLocaleString('pt-BR', { timeZone: timezone, dateStyle: 'short', timeStyle: 'short' });
}

function ageInDays(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000);
}

async function main() {
  const now = new Date();
  const settings = await getSettings();
  const tz = settings.timezone;

  console.log(`\n=== Emissão de cobrança — ${stamp(now, tz)} (${tz}) ===\n`);

  // 1. Assinatura ativa sem cobrança em aberto.
  const orphans = await db.subscription.findMany({
    where: { status: 'ACTIVE', charges: { none: { status: { in: [...OPEN_STATUSES] } } } },
    select: {
      id: true, nextDueAt: true, priceCents: true,
      customer: { select: { name: true } },
      charges: { select: { issuedAt: true }, orderBy: { issuedAt: 'desc' }, take: 1 },
    },
    orderBy: { nextDueAt: 'asc' },
  });

  if (orphans.length === 0) {
    console.log('1. Assinatura ativa sem cobrança em aberto: nenhuma.');
  } else {
    console.log(`1. ⚠️  ${orphans.length} assinatura(s) ATIVA(s) sem cobrança em aberto:\n`);
    for (const sub of orphans) {
      const last = sub.charges[0];
      const lastLabel = last ? `última emissão ${stamp(last.issuedAt, tz)}` : 'nunca emitiu cobrança';
      console.log(`   ${sub.customer.name} · vence ${stamp(sub.nextDueAt, tz)} · ${formatCents(sub.priceCents)} · ${lastLabel}`);
    }
    console.log('\n   → Sem cobrança aberta o cliente não entra em /charges nem na régua.');
    console.log('   → Base importada antes da correção: `pnpm backfill:imported-charges`.');
  }

  // 2. Vencida e ainda OPEN — charges-mark-overdue não passou.
  const staleOpen = await db.charge.count({ where: { status: 'OPEN', dueAt: { lt: now } } });
  console.log(
    staleOpen === 0
      ? '\n2. Cobrança vencida ainda OPEN: nenhuma.'
      : `\n2. ⚠️  ${staleOpen} cobrança(s) vencida(s) ainda em OPEN — 'charges-mark-overdue' não está batendo.`,
  );

  // 3. Pulso da emissão.
  const lastCharge = await db.charge.findFirst({
    orderBy: { issuedAt: 'desc' },
    select: { issuedAt: true, customer: { select: { name: true } } },
  });
  console.log(
    lastCharge
      ? `\n3. Última cobrança emitida: ${stamp(lastCharge.issuedAt, tz)} (${lastCharge.customer.name}) — ${ageInDays(lastCharge.issuedAt, now)} dia(s) atrás.`
      : '\n3. ⚠️  Nenhuma cobrança emitida na base inteira.',
  );

  const openCount = await db.charge.groupBy({ by: ['status'], _count: { _all: true } });
  console.log(`   Por status: ${openCount.map((row) => `${row.status}=${row._count._all}`).join(' · ')}`);

  // 4. Pulso da régua.
  const lastExecution = await db.dunningExecution.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, outcome: true, reason: true },
  });
  console.log(
    lastExecution
      ? `\n4. Última avaliação da régua: ${stamp(lastExecution.createdAt, tz)} — ${ageInDays(lastExecution.createdAt, now)} dia(s) atrás (${lastExecution.outcome}${lastExecution.reason ? `, ${lastExecution.reason}` : ''}).`
      : '\n4. ⚠️  A régua nunca avaliou nada — nenhuma linha em dunning_executions.',
  );

  // 5. Fila represada pelo kill switch.
  const pending = await db.message.count({ where: { status: 'PENDING' } });
  const pendingStale = await db.message.count({
    where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - STALE_MS) } },
  });
  console.log(`\n5. Envio ${settings.sendingPaused ? 'PAUSADO' : 'ativo'} · ${pending} mensagem(ns) PENDING.`);
  if (pendingStale > 0) {
    console.log(`   ⚠️  ${pendingStale} delas já passaram de 24h — viram CANCELLED 'stale' na primeira passada`);
    console.log("      depois de despausar, e o UNIQUE(chargeId, stepId) impede a régua de refazê-las.");
  }

  console.log('');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
