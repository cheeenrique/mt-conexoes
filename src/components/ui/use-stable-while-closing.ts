'use client';

import { useState } from 'react';

/**
 * Um Drawer/Dialog some visualmente em duas etapas: o valor que controla "o
 * que mostrar" vira `null` no clique de fechar, e só ~150ms depois a
 * animação de saída termina de verdade. Se o conteúdo desmontar junto com o
 * valor, sobra painel vazio deslizando para fora — o "piscar" do overlay.
 *
 * Este hook devolve o último valor não nulo recebido, mesmo depois que
 * `value` virou `null`: o conteúdo do drawer usa o valor devolvido aqui
 * (nunca `value` diretamente) para sobreviver à animação inteira.
 *
 * `isSame` decide o que conta como "o mesmo item" — string/número comparam
 * por igualdade; objeto costuma comparar por id.
 */
export function useStableWhileClosing<T>(
  value: T | null,
  isSame: (a: T, b: T) => boolean = (a, b) => a === b,
): T | null {
  const [stable, setStable] = useState(value);
  if (value !== null && (stable === null || !isSame(value, stable))) {
    setStable(value);
  }
  return value ?? stable;
}
