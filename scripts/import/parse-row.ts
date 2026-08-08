/** Normaliza telefone brasileiro pra E.164 (+55DDDNÚMERO). null se impossível — nunca chuta DDD. */
export function normalizePhoneBR(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Já com código do país
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  // DDD + número (10 ou 11 dígitos: fixo 8 dígitos ou celular 9 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  // Sem DDD (7 ou 8 dígitos) — impossível recuperar o DDD, recusa.
  return null;
}

/** Converte valor em reais (string BR/US ou número) pra centavos. null se inválido ou negativo. */
export function parseCentsFromBR(raw: string | number): bigint | null {
  if (typeof raw === 'number') {
    if (raw < 0 || !Number.isFinite(raw)) return null;
    return BigInt(Math.round(raw * 100));
  }

  const cleaned = raw.trim().replace(/^R\$\s*/i, '');
  if (!cleaned) return null;

  // Detecta formato: se tem vírgula E ponto, o último separador é o decimal.
  // Se só tem vírgula, vírgula é decimal (BR). Se só tem ponto, ponto é decimal (US/número puro).
  let normalized: string;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    normalized = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [intPart, fracPart = ''] = normalized.split('.');
  const cents = fracPart.padEnd(2, '0').slice(0, 2);
  return BigInt(intPart) * 100n + BigInt(cents || '0');
}

/** Aceita "DD/MM/AAAA" ou um Date já convertido pelo parser do xlsx. null se inválido. */
export function parseDateBR(raw: string | number | Date): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') return null; // serial numérico não tratado aqui — xlsx já resolve células-data como Date

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, dayStr, monthStr, yearStr] = match;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  const date = new Date(Date.UTC(year, month - 1, day));
  // Valida que a data não "estourou" (ex.: 32/13 vira outro mês/ano em JS puro)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
