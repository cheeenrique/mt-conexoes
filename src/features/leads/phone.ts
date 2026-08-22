import { nationalDigitsBR } from '@/core/phone';

/**
 * E.164 a partir do que o visitante digitou no site, ou `null` se não é um
 * telefone brasileiro. Devolver `null` é o que faz a rota pública responder
 * 400 em vez de gravar lixo.
 */
export function normalizeBrazilPhone(phone: string): string | null {
  const national = nationalDigitsBR(phone);
  return national ? `+55${national}` : null;
}
