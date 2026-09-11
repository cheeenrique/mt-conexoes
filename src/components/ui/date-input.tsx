'use client';

import { IMaskInput } from 'react-imask';

export function DateInput({
  value,
  onValueChange,
  id,
}: {
  value: string; // ISO yyyy-MM-dd
  onValueChange: (isoDate: string) => void;
  id?: string;
}) {
  return (
    <IMaskInput
      id={id}
      mask="00/00/0000"
      value={value ? value.split('-').reverse().join('/') : ''}
      unmask={false}
      onAccept={(masked: string) => {
        // Digitação parcial não propaga: o valor volta como prop e a máscara
        // reescreveria o campo a cada tecla. Campo esvaziado propaga `''` —
        // sem isso o formulário seguia enviando a última data completa
        // digitada, invisível na tela.
        const [day, month, year] = masked.split('/');
        const next = masked === '' ? '' : day && month && year?.length === 4 ? `${year}-${month}-${day}` : null;
        if (next === null) return;

        // ⚠️ A máscara dispara `onAccept` sozinha ao montar, só para reformatar
        // o valor que recebeu. Sem esta comparação isso chega ao pai como
        // "o operador mexeu no campo": o diálogo de pagamento, que usa esse
        // sinal para parar de sugerir o próximo vencimento, nascia achando que
        // ele já tinha escolhido uma data — e o campo ficava em branco.
        if (next === value) return;
        onValueChange(next);
      }}
      className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground"
    />
  );
}
