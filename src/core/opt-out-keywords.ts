export const OPT_OUT_KEYWORDS = ['PARE', 'SAIR', 'CANCELAR', 'DESCADASTRAR', 'STOP'] as const;

/** Match exato (mensagem inteira, normalizada) contra a whitelist — nunca substring. */
export function matchOptOutKeyword(text: string): string | null {
  const normalized = text.trim().toUpperCase();
  const match = OPT_OUT_KEYWORDS.find((keyword) => keyword === normalized);
  return match ?? null;
}
