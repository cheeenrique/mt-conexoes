export function formatCents(value: string | bigint): string {
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const reais = Number(cents) / 100;
  const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reais);
  // Normalize non-breaking spaces (U+00A0) to regular spaces
  return formatted.replace(/ /g, ' ');
}
