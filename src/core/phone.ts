/** Normaliza um telefone de WhatsApp (com ou sem "+", com ou sem formatação) pro E.164 armazenado em Customer.phone. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `+${digits}`;
}

/**
 * Dígitos nacionais (DDD + número) de um telefone brasileiro, ou `null` se o
 * número não é brasileiro.
 *
 * ⚠️ Só descasca o `55` quando ele é de fato código de país. `+13105551234`
 * tem 11 dígitos como um celular brasileiro e formatá-lo como `(13) 10555-1234`
 * inventa um DDD que não existe — número com `+` de outro país sai como `null`.
 */
export function nationalDigitsBR(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  const explicitCountry = phone.trim().startsWith('+');

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  if (explicitCountry) return null;

  return digits.length === 10 || digits.length === 11 ? digits : null;
}

/**
 * Dígitos comparáveis com o telefone guardado em E.164, a partir do que o
 * operador digitou na busca. `(11) 9` vira `119`, que casa com `+5511987654321`.
 *
 * Devolve `null` quando o termo tem letra — aí é nome ou usuário de acesso, e
 * comparar o "2" de "João 2" contra a coluna de telefone só traria linha à toa.
 */
export function phoneSearchDigits(term: string): string | null {
  if (/[a-zA-Z]/.test(term)) return null;
  const digits = term.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}
