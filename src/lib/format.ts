const reaisFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCents(value: string | bigint): string {
  const cents = typeof value === 'bigint' ? value : BigInt(value);
  const negative = cents < 0n;
  const absoluteCents = negative ? -cents : cents;

  const reais = absoluteCents / 100n;
  const remainder = (absoluteCents % 100n).toString().padStart(2, '0');

  // Normalize non-breaking spaces (U+00A0) to regular spaces
  const formattedReais = reaisFormatter.format(reais).replace(/ /g, ' ');
  const formatted = `${formattedReais},${remainder}`;

  return negative ? `-${formatted}` : formatted;
}
