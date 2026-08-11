/** Normaliza um telefone de WhatsApp (com ou sem "+", com ou sem formatação) pro E.164 armazenado em Customer.phone. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  return `+${digits}`;
}
