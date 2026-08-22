import { toE164, nationalDigitsBR } from '@/core/phone';

const reaisFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const BR_MOBILE = /^(\d{2})(\d{5})(\d{4})$/;
const BR_LANDLINE = /^(\d{2})(\d{4})(\d{4})$/;

/** Telefone guardado em E.164 exibido como o operador lê: `(11) 99999-8888`. */
export function formatPhoneBR(phone: string): string {
  const national = nationalDigitsBR(phone);
  if (!national) return phone;

  const match = national.match(national.length === 11 ? BR_MOBILE : BR_LANDLINE);
  if (!match) return phone;

  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

/** Conversa no WhatsApp do cliente/lead. O número já vai com país — nunca prefixar 55 duas vezes. */
export function whatsAppUrl(phone: string): string {
  const digits = toE164(phone).slice(1);
  const national = nationalDigitsBR(phone);
  return `https://wa.me/${national ? `55${national}` : digits}`;
}

export function formatLocalDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: timezone }).format(
    new Date(iso),
  );
}

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

/** Hora local do negócio, `HH:MM` — nunca o fuso do navegador. */
export function formatLocalTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(
    new Date(iso),
  );
}

/** `MM/AAAA`, para "cliente desde". */
export function formatLocalMonthYear(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: timezone }).format(
    new Date(iso),
  );
}

/** `DD/MM`, o formato curto da coluna de vencimento da lista. */
export function formatLocalDayMonth(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: timezone }).format(
    new Date(iso),
  );
}

/** Centavos como decimal com vírgula, sem separador de milhar — é o valor
 *  inicial que o `CurrencyInput` entrega ao IMaskInput, que aplica seu próprio
 *  agrupamento na exibição. Diferente de `formatCents`: sem símbolo de moeda,
 *  sem `Intl.NumberFormat`, pensado para alimentar um campo editável, não para
 *  exibição final. */
export function centsToDecimalString(cents: string): string {
  const total = BigInt(cents || '0');
  const negative = total < 0n;
  const abs = negative ? -total : total;
  const integerPart = abs / 100n;
  const fractionalPart = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${integerPart},${fractionalPart}`;
}
