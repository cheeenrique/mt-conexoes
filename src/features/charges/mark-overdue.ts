import type { ChargeStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { deriveChargeStatus } from '@/core/billing';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 500;
const LIVE_STATUSES = ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'] as const;

type LiveCharge = {
  id: string;
  status: ChargeStatus;
  principalCents: bigint;
  discountCents: bigint;
  dueAt: Date;
  payments: { amountCents: bigint }[];
};

async function fetchBatch(cursor: string | undefined): Promise<LiveCharge[]> {
  return db.charge.findMany({
    where: { status: { in: [...LIVE_STATUSES] } },
    orderBy: { id: 'asc' },
    take: BATCH_SIZE,
    select: {
      id: true,
      status: true,
      principalCents: true,
      discountCents: true,
      dueAt: true,
      payments: { select: { amountCents: true } },
    },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
}

// Só agrupa quem realmente muda de status — o cálculo (deriveChargeStatus)
// é puro e vive em core/billing.ts. Aqui só decide em qual updateMany cada
// id entra, pra virar no máximo 1 escrita por status-alvo por lote em vez
// de 1 escrita por cobrança.
function groupIdsByNewStatus(charges: LiveCharge[], now: Date): Map<ChargeStatus, string[]> {
  const groups = new Map<ChargeStatus, string[]>();
  for (const charge of charges) {
    const netCents = charge.principalCents - charge.discountCents;
    const paidCents = charge.payments.reduce((sum, p) => sum + p.amountCents, 0n);
    const newStatus = deriveChargeStatus({ netCents, paidCents, dueAt: charge.dueAt, now });
    if (newStatus === charge.status) continue;

    const ids = groups.get(newStatus) ?? [];
    ids.push(charge.id);
    groups.set(newStatus, ids);
  }
  return groups;
}

function countPending(groups: Map<ChargeStatus, string[]>): number {
  return [...groups.values()].reduce((sum, ids) => sum + ids.length, 0);
}

// Um updateMany por status-alvo, todos os grupos do bloco numa única
// transação — "cada bloco em transação própria" (.claude/rules/03-dados.md).
async function writeGroups(groups: Map<ChargeStatus, string[]>): Promise<void> {
  await db.$transaction(
    [...groups.entries()].map(([status, ids]) => db.charge.updateMany({ where: { id: { in: ids } }, data: { status } })),
  );
}

/**
 * Recalcula o status das cobranças vivas (OPEN/OVERDUE/PARTIALLY_PAID) contra
 * o vencimento. Processa em blocos de BATCH_SIZE, cada bloco em uma única
 * transação com um `updateMany` por status-alvo — nunca um `update` por
 * cobrança. Bloco que falha é logado e não derruba os demais; `now` entra
 * por parâmetro para o job ficar testável sem mockar o relógio.
 */
export async function markOverdueCharges(now: Date): Promise<{ checked: number; updated: number; failed: number }> {
  let checked = 0;
  let updated = 0;
  let failed = 0;
  let cursor: string | undefined;

  for (;;) {
    const batch = await fetchBatch(cursor);
    if (batch.length === 0) break;

    checked += batch.length;
    cursor = batch[batch.length - 1].id;

    const groups = groupIdsByNewStatus(batch, now);
    const pending = countPending(groups);

    try {
      if (pending > 0) await writeGroups(groups);
      updated += pending;
    } catch (err) {
      failed += pending;
      logger.error({ job: 'charges-mark-overdue', cursor, batchSize: batch.length, error: String(err) });
    }

    if (batch.length < BATCH_SIZE) break;
  }

  return { checked, updated, failed };
}
