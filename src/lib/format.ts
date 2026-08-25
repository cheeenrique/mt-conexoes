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

/** Percentual como o operador brasileiro lê: `74,9%`, com vírgula.
 *
 *  ⚠️ Nasceu porque 12 lugares chamavam `toFixed` direto — sete com zero casas,
 *  cinco com uma — e os de uma casa exibiam `74.9%` com ponto, numa UI toda em
 *  pt-BR. Ficha do cliente chegava a mostrar `margem 75%` no cabeçalho e
 *  `74.9%` no formulário logo abaixo.
 *
 *  Aceita `number`, `string` e `Decimal` porque é o que os sites já tinham em
 *  mãos. `null` vira travessão, que é o que as telas já mostravam. */
export function formatPercent(
  value: number | string | { toFixed: (digits: number) => string } | null,
  fractionDigits = 0,
): string {
  if (value === null) return '—';

  const fixed =
    typeof value === 'number' || typeof value === 'string'
      ? Number(value).toFixed(fractionDigits)
      : value.toFixed(fractionDigits);

  return `${fixed.replace('.', ',')}%`;
}
