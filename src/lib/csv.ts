/** Escapa célula que começa com =, +, -, @ — mitigação de CSV injection (regra dura do projeto). */
export function escapeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeField(value: string): string {
  const escaped = escapeCsvCell(value);
  return /[",\r\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** Serializa em CSV (RFC 4180, CRLF), com escape de fórmula em toda célula. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeField).join(',')).join('\r\n');
}
