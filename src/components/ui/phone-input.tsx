'use client';

import { useState } from 'react';
import { IMaskInput } from 'react-imask';

function toE164(digits: string): string {
  return digits ? `+55${digits}` : '';
}

function fromE164(e164: string): string {
  return e164.replace(/^\+55/, '');
}

/**
 * Mesma checagem de `core/phone.nationalDigitsBR`, duplicada aqui de
 * propósito: `components/ui/` não importa `core/` (`.claude/rules/01-arquitetura.md`
 * §Matriz de import — "components/ui não conhece o domínio"). Só decide se o
 * valor já guardado é um WhatsApp brasileiro, pra abrir o campo no modo certo.
 */
function looksBrazilian(e164: string): boolean {
  if (!e164) return true; // campo vazio começa no modo padrão (Brasil)
  const digits = e164.replace(/\D/g, '');
  return digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
}

/**
 * WhatsApp do cliente, em E.164. Padrão é o Brasil, com máscara de DDD —
 * cobre a imensa maioria dos cadastros. "Outro país" troca pra um campo livre
 * (sem máscara): o operador digita o número completo com o código do país,
 * porque uma máscara única não serve pra tamanho/formato que varia por país.
 */
export function PhoneInput({
  value,
  onValueChange,
  onBlur,
  id,
  disabled,
}: {
  value: string; // E.164, ex.: +5511999998888
  onValueChange: (e164: string) => void;
  /** Repassado ao `<input>` interno — usado para checar duplicidade ao sair do campo. */
  onBlur?: () => void;
  id?: string;
  disabled?: boolean;
}) {
  const [international, setInternational] = useState(() => !looksBrazilian(value));

  return (
    <div>
      {international ? (
        <input
          id={id}
          type="tel"
          inputMode="tel"
          placeholder="+1 305 555 1234"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            // Mantém só "+" (uma vez, na frente) e dígitos — sem máscara de
            // formato porque o tamanho varia por país.
            const raw = event.target.value;
            const digits = raw.replace(/[^\d]/g, '');
            onValueChange(digits ? `+${digits}` : '');
          }}
          onBlur={onBlur}
          className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      ) : (
        <IMaskInput
          id={id}
          mask="(00) 00000-0000"
          value={fromE164(value)}
          unmask={true}
          disabled={disabled}
          onAccept={(_masked: string, instance: { unmaskedValue: string }) => {
            onValueChange(toE164(instance.unmaskedValue));
          }}
          onBlur={onBlur}
          className="h-11 w-full rounded-sm border border-border bg-surface-elevated px-3 font-mono tabular-mono text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onValueChange('');
          setInternational((current) => !current);
        }}
        className="mt-1 text-xs text-foreground-muted underline-offset-2 hover:text-foreground hover:underline disabled:pointer-events-none disabled:opacity-50"
      >
        {international ? 'Usar formato brasileiro' : 'Cliente de outro país?'}
      </button>
    </div>
  );
}
