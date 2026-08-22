'use client';

import { useEffect, useState } from 'react';
import type { FindCustomerByPhone } from './convert-types';

/**
 * "Esse WhatsApp já é de alguém?" — checado ao abrir a conversão de um lead,
 * para avisar **antes** de submeter em vez de só depois, na resposta do
 * servidor (handoff 08 §"Converter em cliente" regra 2).
 *
 * Só refaz a checagem quando o lead muda: o telefone nasce preenchido por ele
 * e raramente é editado no formulário.
 */
export function useExistingCustomerByPhone(
  phone: string | undefined,
  checkPhone: FindCustomerByPhone | undefined,
): { id: string; name: string } | null {
  const [existing, setExisting] = useState<{ id: string; name: string } | null>(null);
  const [checkedPhone, setCheckedPhone] = useState(phone);

  // Ajuste durante o render, não em efeito: evita o render em cascata de um
  // `setState` síncrono no início do `useEffect` abaixo.
  if (phone !== checkedPhone) {
    setCheckedPhone(phone);
    setExisting(null);
  }

  useEffect(() => {
    let active = true;
    if (!checkPhone || !phone) return;
    checkPhone(phone).then((found) => { if (active) setExisting(found); });
    return () => { active = false; };
  }, [phone, checkPhone]);

  return existing;
}
