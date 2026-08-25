import { read, utils, type WorkBook } from 'xlsx';
import { normalizePhoneBR } from '@/core/phone';
import { ImportFileUnreadableError } from './errors';
import { parseCentsFromBR, parseDateBR, toBusinessDueDate } from './parse-row';

/**
 * Nomes de coluna confirmados contra o arquivo real (`Planilha para cadastro
 * de Clientes UNIPLAY 2026.xlsm`, doc de design da Etapa 1c). `trim()`
 * aplicado na hora de ler o cabeçalho — a planilha real tem espaço em branco
 * em alguns nomes (`" VALOR "`, `"  WHATSAPP"`).
 */
const COLUMN = {
  name: ['CODIGO', 'CÓDIGO', 'NOME'],
  phone: ['WHATSAPP', 'TELEFONE', 'CONTATO'],
  username: ['USUARIO', 'USUÁRIO'],
  password: ['SENHA'],
  startedAt: ['CRIAÇÃO', 'CRIACAO', 'DATA DE CRIAÇÃO'],
  dueDate: ['VALIDADE', 'VENCIMENTO', 'DATA DE VENCIMENTO'],
  screens: ['TELAS'],
  cost: ['CUSTO'],
  price: ['VALOR'],
} as const;

function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key.trim().toUpperCase()] = value;
  }
  return normalized;
}

function pick(row: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

/**
 * Acha a primeira aba com linha de dado, em vez de assumir a primeira do
 * arquivo — o arquivo real da UniPlay tem uma segunda aba (`Planilha1`)
 * sempre vazia, e um fornecedor diferente pode ordenar as abas de outro jeito.
 */
function pickDataSheetName(workbook: WorkBook): string | null {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: undefined });
    if (rows.length > 0) return name;
  }
  return null;
}

/** Lê as linhas da aba com dado de um `.xlsx`/`.xlsm` já carregado em memória. */
export function readWorkbookRows(buffer: Buffer): Record<string, unknown>[] {
  let workbook: WorkBook;
  try {
    workbook = read(buffer, { type: 'buffer', cellDates: true });
  } catch (err) {
    throw new ImportFileUnreadableError(err);
  }

  const sheetName = pickDataSheetName(workbook);
  if (!sheetName) return [];
  return utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: undefined });
}

export interface ParsedImportRow {
  identifier: string;
  name: string;
  phone: string | null;
  phoneWasInvalid: boolean;
  username: string | null;
  password: string | null;
  startedAt: Date;
  dueDate: Date;
  priceCents: bigint;
  costCents: bigint;
  screens: number;
}

export type ParseRowResult = { ok: true; data: ParsedImportRow } | { ok: false; identifier: string; reason: string };

/**
 * Parser puro de uma linha da planilha: sem banco, sem I/O. Recusa em vez de
 * chutar — nome vazio, vencimento ausente/impossível e valor ausente/negativo
 * saem como `ok: false` com o motivo, nunca como um registro com valor
 * inventado (design da Etapa 1c, §Validação e recusa).
 *
 * `now` entra por parâmetro para o fallback de `CRIAÇÃO` ausente continuar
 * determinístico e testável.
 */
export function parseImportRow(rawRow: Record<string, unknown>, timezone: string, now: Date): ParseRowResult {
  const row = normalizeHeaders(rawRow);

  const rawName = pick(row, COLUMN.name);
  const name = typeof rawName === 'string' ? rawName.trim() : String(rawName ?? '').trim();
  const identifier = name || '(sem nome)';
  if (!name) return { ok: false, identifier, reason: 'Nome ausente.' };

  const rawDue = pick(row, COLUMN.dueDate);
  const parsedDueDate = rawDue !== undefined ? parseDateBR(rawDue as string | number | Date) : null;
  if (!parsedDueDate) return { ok: false, identifier, reason: 'Data de vencimento ausente ou inválida.' };
  const dueDate = toBusinessDueDate(parsedDueDate, timezone);

  const rawPrice = pick(row, COLUMN.price);
  const priceCents = rawPrice !== undefined ? parseCentsFromBR(rawPrice as string | number) : null;
  if (priceCents === null) return { ok: false, identifier, reason: 'Valor do serviço ausente, inválido ou negativo.' };

  const rawCost = pick(row, COLUMN.cost);
  const costCents = rawCost !== undefined ? (parseCentsFromBR(rawCost as string | number) ?? 0n) : 0n;

  const rawStarted = pick(row, COLUMN.startedAt);
  const parsedStartedAt = rawStarted !== undefined ? parseDateBR(rawStarted as string | number | Date) : null;
  const startedAt = parsedStartedAt ? toBusinessDueDate(parsedStartedAt, timezone) : now;

  const rawUsername = pick(row, COLUMN.username);
  const username = rawUsername !== undefined ? String(rawUsername).trim() || null : null;

  const rawPassword = pick(row, COLUMN.password);
  const password = rawPassword !== undefined ? String(rawPassword).trim() || null : null;

  const screensRaw = pick(row, COLUMN.screens);
  const screensNumber = typeof screensRaw === 'number' ? screensRaw : Number(screensRaw);
  const screens = screensRaw !== undefined && !Number.isNaN(screensNumber) ? Math.max(1, Math.floor(screensNumber)) : 1;

  const rawPhone = pick(row, COLUMN.phone);
  const phone = rawPhone !== undefined ? normalizePhoneBR(String(rawPhone)) : null;
  const phoneWasInvalid = rawPhone !== undefined && !phone;

  return {
    ok: true,
    data: { identifier, name, phone, phoneWasInvalid, username, password, startedAt, dueDate, priceCents, costCents, screens },
  };
}
