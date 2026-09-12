/**
 * Acha assinaturas com preço fora do que o cliente de fato paga.
 *
 * Nasceu de dois casos relatados em 11/09/2026: clientes de R$ 30,00/mês
 * cadastrados em R$ 1.830,00 e R$ 750,00. O sistema estava certo em marcar o
 * pagamento como parcial — o cadastro é que estava cem vezes maior. A causa
 * provável é o campo de dinheiro, que até então somava o dígito digitado ao
 * valor que já estava lá em vez de substituir o conteúdo selecionado
 * (`components/ui/currency-input.tsx`).
 *
 * O sinal mais honesto é o **histórico de pagamento**: quem paga R$ 30 todo mês
 * não tem assinatura de R$ 1.830. Margem altíssima entra como sinal secundário,
 * para quem ainda não pagou nada e por isso não tem histórico.
 *
 * Puro de propósito — recebe as linhas já lidas e não toca no banco, para o
 * script de CLI e um eventual uso na tela dividirem a mesma regra.
 */

/**
 * Acima disto, o preço destoa tanto do que o cliente paga que é quase certo
 * erro de digitação. Cinco e não dois: pagar metade ou um terço da cobrança é
 * parcelamento combinado, acontece toda semana, e acusar isso encheria a lista
 * de ruído. Os casos reais que motivaram a auditoria estavam em 25x e 61x.
 */
const PAYMENT_RATIO_THRESHOLD = 5;

/** Margem que nenhuma revenda pratica: sinal para quem ainda não tem pagamento. */
const IMPLAUSIBLE_MARGIN = 0.9;

export interface SubscriptionPriceRow {
  id: string;
  customerName: string;
  priceCents: bigint;
  costCents: bigint;
  paymentsCents: bigint[];
}

export interface PriceSuspicion {
  id: string;
  customerName: string;
  priceCents: bigint;
  costCents: bigint;
  /** Mediana do que o cliente pagou — `null` quando nunca pagou. */
  typicalPaymentCents: bigint | null;
  reason: 'paga_muito_menos' | 'margem_implausivel';
  /** Quantas vezes o preço é maior que o pagamento típico. Só em `paga_muito_menos`. */
  ratio: number | null;
}

/** Mediana em centavos. Mediana e não média: um pagamento avulso não desloca o retrato. */
function median(values: bigint[]): bigint | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2n;
}

export function findPriceSuspicions(rows: SubscriptionPriceRow[]): PriceSuspicion[] {
  const suspicions: PriceSuspicion[] = [];

  for (const row of rows) {
    if (row.priceCents <= 0n) continue;
    const typical = median(row.paymentsCents);

    if (typical !== null && typical > 0n) {
      const ratio = Number(row.priceCents) / Number(typical);
      if (ratio >= PAYMENT_RATIO_THRESHOLD) {
        suspicions.push({ ...row, typicalPaymentCents: typical, reason: 'paga_muito_menos', ratio });
      }
      continue;
    }

    // Sem histórico, o único sinal é a margem: custo de R$ 10 com preço de
    // R$ 1.830 é 99,5%, que nenhuma revenda pratica.
    if (row.costCents > 0n) {
      const margin = 1 - Number(row.costCents) / Number(row.priceCents);
      if (margin >= IMPLAUSIBLE_MARGIN) {
        suspicions.push({ ...row, typicalPaymentCents: null, reason: 'margem_implausivel', ratio: null });
      }
    }
  }

  return suspicions.sort((a, b) => (b.priceCents > a.priceCents ? 1 : -1));
}
