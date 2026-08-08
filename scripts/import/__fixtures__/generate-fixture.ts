import { utils, write } from 'xlsx';

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Serial de data do Excel — o mesmo número inteiro que uma célula-data carrega num
 * `.xlsx` gerado pelo próprio Excel: dias corridos desde 30/12/1899, sem timezone
 * embutido.
 *
 * Passar um `Date` do JS direto pro `xlsx.write` (via `json_to_sheet`) faz a lib
 * convertê-lo com `datenum()`, que compensa o fuso *local do processo* (inclusive o
 * LMT histórico da timezone, ex. America/Sao_Paulo tinha offset de -3h com uns minutos
 * a mais antes da hora oficial). Isso é um transform que uma planilha real nunca sofre
 * na escrita — só na leitura, uma vez, quando `cellDates: true` decodifica o serial de
 * volta pra `Date`. Calcular o serial aqui, direto em UTC, evita esse transform espúrio
 * e faz o fixture se comportar como um `.xlsx` autêntico.
 */
function toExcelSerial(date: Date): number {
  const utcMidnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return (utcMidnight - EXCEL_EPOCH_UTC) / MS_PER_DAY;
}

export function buildFixtureWorkbook(rows: Record<string, unknown>[]): Buffer {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const dateCells: Array<{ r: number; c: number }> = [];
  const aoa: unknown[][] = [headers];

  rows.forEach((row, rowIndex) => {
    const line = headers.map((header, colIndex) => {
      const value = row[header];
      if (value instanceof Date) {
        dateCells.push({ r: rowIndex + 1, c: colIndex });
        return toExcelSerial(value);
      }
      return value;
    });
    aoa.push(line);
  });

  const sheet = utils.aoa_to_sheet(aoa);

  // Marca as células que vieram de Date com formato de data — sem isso a leitura com
  // `cellDates: true` não sabe que o número é uma data e devolve o serial cru.
  for (const { r, c } of dateCells) {
    const cell = sheet[utils.encode_cell({ r, c })];
    if (cell) cell.z = 'm/d/yy';
  }

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, sheet, 'IPTV');
  return write(workbook, { type: 'buffer', bookType: 'xlsx' });
}
