import { db } from '@/lib/db';
import { buildImportedFirstCharge } from '@/features/subscriptions/imported-charge';

/**
 * Abre a primeira cobrança das assinaturas importadas antes da correção — as
 * que ficaram `ACTIVE` com zero cobrança porque a importação da Etapa 1c foi
 * escrita quando `Charge` ainda não existia (ver `buildImportedFirstCharge`).
 *
 * Mora em `app/` porque cruza `subscriptions` e `charges`, a mesma razão de
 * `customer-import.ts` (`.claude/rules/01-arquitetura.md` §Matriz de import).
 *
 * Recorte deliberadamente estreito: só assinatura **sem nenhuma** cobrança.
 * Assinatura cuja única cobrança foi cancelada fica de fora — ali o operador
 * decidiu cancelar, e emitir de novo por trás dele seria ressuscitar cobrança
 * que ele mandou embora.
 */
export interface ChargeBackfillRow {
  subscriptionId: string;
  customerName: string;
  dueAt: Date;
  priceCents: bigint;
}

export interface ChargeBackfillSummary {
  candidates: ChargeBackfillRow[];
  created: number;
  totalCents: bigint;
}

const BACKFILL_BATCH_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export async function backfillImportedCharges(params: {
  timezone: string;
  /** Sem `apply`, nada é gravado: devolve só a lista do que sairia. */
  apply: boolean;
}): Promise<ChargeBackfillSummary> {
  const subscriptions = await db.subscription.findMany({
    where: {
      status: 'ACTIVE',
      charges: { none: {} },
      customer: { deletedAt: null, anonymizedAt: null },
      // Cortesia (preço zero) nunca teve cobrança de propósito — ver
      // `isCourtesySubscription`. Sem este recorte o backfill "conserta" justamente
      // as assinaturas que a regra manda deixar sem cobrança.
      priceCents: { gt: 0 },
    },
    orderBy: { nextDueAt: 'asc' },
    select: {
      id: true,
      customerId: true,
      supplierId: true,
      priceCents: true,
      costCents: true,
      cycle: true,
      nextDueAt: true,
      customer: { select: { name: true } },
    },
  });

  const candidates: ChargeBackfillRow[] = subscriptions.map((sub) => ({
    subscriptionId: sub.id,
    customerName: sub.customer.name,
    dueAt: sub.nextDueAt,
    priceCents: sub.priceCents,
  }));
  const totalCents = subscriptions.reduce((sum, sub) => sum + sub.priceCents, 0n);

  if (!params.apply) return { candidates, created: 0, totalCents };

  let created = 0;
  for (const block of chunk(subscriptions, BACKFILL_BATCH_SIZE)) {
    await db.$transaction(
      async (tx) => {
        for (const sub of block) {
          await tx.charge.create({
            data: buildImportedFirstCharge({
              subscriptionId: sub.id,
              customerId: sub.customerId,
              supplierId: sub.supplierId,
              priceCents: sub.priceCents,
              costCents: sub.costCents,
              cycle: sub.cycle,
              nextDueAt: sub.nextDueAt,
              timezone: params.timezone,
            }),
          });
          created += 1;
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  return { candidates, created, totalCents };
}
