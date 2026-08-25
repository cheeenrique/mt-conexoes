import { endOfLocalDay } from '@/core/dates';
import { SSF } from 'xlsx';

/**
 * Converte um `Date` decodificado pelo `xlsx` (`cellDates: true`) pro instante
 * correto de vencimento/início: 23:59:59 no fuso do negócio, não meia-noite UTC.
 *
 * O `Date` que o `xlsx` devolve carrega o dia certo em termos de UTC — a
 * decodificação do serial do Excel só introduz deriva de horário dentro do
 * mesmo dia (compensação de LMT histórico), nunca troca o dia. Por isso as
 * partes de calendário são lidas com getters UTC (`getUTCFullYear` etc.),
 * nunca getters locais — getters locais dependem do fuso do processo Node
 * (`TZ`), que no Cloud Run não é necessariamente o fuso do negócio.
 */
export function toBusinessDueDate(cellDate: Date, timezone: string): Date {
  return endOfLocalDay(cellDate.getUTCFullYear(), cellDate.getUTCMonth(), cellDate.getUTCDate(), timezone);
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

/**
 * Serial de data do Excel (`46265`) para `Date` em UTC, sem hora.
 *
 * O `xlsx` só entrega `Date` quando a célula carrega formato de data. Numa
 * planilha em que a coluna de vencimento é número puro — acontece quando alguém
 * cola valor sem formatar — toda linha era recusada por "data ausente ou
 * inválida", culpando o dado por uma limitação do parser. Encontrado em
 * 25/08/2026 importando pela tela.
 *
 * Usa o `SSF` do próprio `xlsx` em vez de aritmética à mão: o serial 1 não é
 * 01/01/1900 puro, e o calendário do Excel tem um 29/02/1900 que nunca existiu,
 * herdado do Lotus 1-2-3. Reimplementar isso é como se erra por um dia.
 *
 * A checagem de ida e volta no fim é a mesma do ramo de texto, e é o que recusa
 * justamente esse 29/02/1900 em vez de deixá-lo virar 01/03 em silêncio.
 */
function parseExcelSerial(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;

  const parts = SSF.parse_date_code(serial);
  if (!parts) return null;

  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  if (date.getUTCFullYear() !== parts.y || date.getUTCMonth() !== parts.m - 1 || date.getUTCDate() !== parts.d) {
    return null;
  }
  return date;
}

/** Aceita "DD/MM/AAAA" ou um Date já convertido pelo parser do xlsx. null se inválido. */
export function parseDateBR(raw: string | number | Date): Date | null {
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number') return parseExcelSerial(raw);

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
