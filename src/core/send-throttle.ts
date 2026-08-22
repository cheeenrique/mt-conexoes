/**
 * Ritmo do despacho de mensagens, derivado da `rateLimitPerMinute` que cada
 * canal já declara em `ChannelCapabilities` — o campo existia e não tinha
 * consumidor: `scheduled-dispatch.ts` mandava um lote de 60 em rajada
 * sequencial, sem atraso nenhum, 3x acima do limite que o próprio adapter
 * Evolution declara (20/min). Cadência assim é a assinatura que heurística
 * antispam do WhatsApp procura, e não tem recuperação: número banido é
 * número novo.
 */

const JITTER_RATIO = 0.3; // ±30% sobre o intervalo-base — sem variação, a cadência
// fica perfeitamente periódica, que é ela mesma um padrão reconhecível.

/**
 * Atraso, em ms, antes do próximo envio ao provider. `random` é injetado —
 * nunca `Math.random` direto — pela mesma disciplina do `now`: sem isso o
 * teste vira loteria e a função deixa de ser pura.
 */
export function sendDelayMs(rateLimitPerMinute: number, random: () => number): number {
  if (rateLimitPerMinute <= 0) return 0;
  const baseMs = 60_000 / rateLimitPerMinute;
  const jitter = baseMs * JITTER_RATIO * (random() * 2 - 1); // random() em [0,1) → jitter em [-30%,+30%]
  return Math.round(Math.max(0, baseMs + jitter));
}

/** Teto herdado do desenho original — mantém o handler bem abaixo do timeout
 *  do Cloud Run mesmo num canal sem limite declarado. */
const MAX_BATCH_SIZE = 60;

/**
 * Quantas mensagens processar numa passada, derivado do limite do canal.
 * `rateLimitPerMinute * 2` cobre ~30s de envio a pleno ritmo por lote: no
 * canal mais lento (Evolution, 20/min) dá 40 mensagens × ~3s ≈ 2min de
 * wall-clock, bem dentro do timeout do Cloud Run e do próprio intervalo de
 * 15min entre passadas; no canal mais rápido (Meta Cloud, 80/min) o cálculo
 * (160) estoura o teto herdado, então fica em 60.
 */
export function dispatchBatchSize(rateLimitPerMinute: number): number {
  if (rateLimitPerMinute <= 0) return MAX_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, rateLimitPerMinute * 2);
}
